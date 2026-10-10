package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrCredentialNotFound = errors.New("channel credential not found")

// CredentialStatus is the safe, non-secret projection of a stored credential.
// API keys are never returned; clients only see whether one is configured.
type CredentialStatus struct {
	ChannelID string `json:"channelId"`
	BaseURL   string `json:"baseUrl"`
	AuthType  string `json:"authType"`
	HasKey    bool   `json:"hasKey"`
	Enabled   bool   `json:"enabled"`
	UpdatedAt string `json:"updatedAt"`
}

// credentialKey derives the AES-GCM key from WORKSPACE_CRED_KEY (sha256).
// Production must inject a real secret; an unset env fails closed so keys
// are never silently stored under an empty/known key.
func credentialKey() ([]byte, error) {
	raw := os.Getenv("WORKSPACE_CRED_KEY")
	if raw == "" {
		return nil, errors.New("WORKSPACE_CRED_KEY is not set; refusing to store credentials with an empty key")
	}
	sum := sha256.Sum256([]byte(raw))
	return sum[:], nil
}

func encryptSecret(plaintext string) ([]byte, error) {
	key, err := credentialKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	// ciphertext = nonce || seal
	return append(nonce, gcm.Seal(nil, nonce, []byte(plaintext), nil)...), nil
}

func decryptSecret(blob []byte) (string, error) {
	key, err := credentialKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(blob) < gcm.NonceSize() {
		return "", errors.New("credential ciphertext too short")
	}
	nonce, sealed := blob[:gcm.NonceSize()], blob[gcm.NonceSize():]
	plain, err := gcm.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", errors.New("credential decryption failed: key mismatch or corrupted blob")
	}
	return string(plain), nil
}

// Put stores or replaces a channel credential. Empty apiKey clears the key
// (keeps base_url/auth_type); empty baseURL clears the whole row.
func (s Store) PutCredential(ctx context.Context, workspace, channelID, baseURL, authType, apiKey, actor string) error {
	if baseURL == "" && apiKey == "" {
		// full clear
		_, err := s.Pool.Exec(ctx, `DELETE FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID)
		return err
	}
	if baseURL == "" {
		return errors.New("base_url is required when storing credentials")
	}
	// fetch existing row first so clearing just the key keeps base_url/auth_type
	var existingBase, existingAuth string
	var existingCipher []byte
	err := s.Pool.QueryRow(ctx, `SELECT base_url, auth_type, key_ciphertext FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID).
		Scan(&existingBase, &existingAuth, &existingCipher)
	rowExists := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	finalBase, finalAuth := baseURL, authType
	if baseURL == "" {
		finalBase = existingBase
	}
	if authType == "" {
		finalAuth = existingAuth
	}

	var ciphertext []byte
	if apiKey != "" {
		ciphertext, err = encryptSecret(apiKey)
		if err != nil {
			return err
		}
	} else if rowExists {
		ciphertext = existingCipher
	} else {
		return errors.New("api_key is required for a new credential row")
	}

	if rowExists {
		_, err = s.Pool.Exec(ctx, `UPDATE channel_credentials SET base_url=$3, auth_type=$4, key_ciphertext=$5, enabled=true, updated_by=$6, updated_at=now()
            WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID, finalBase, finalAuth, ciphertext, actor)
		return err
	}
	_, err = s.Pool.Exec(ctx, `INSERT INTO channel_credentials (workspace_id, channel_id, base_url, auth_type, key_ciphertext, enabled, updated_by)
        VALUES ($1,$2,$3,$4,$5,true,$6)`, workspace, channelID, finalBase, finalAuth, ciphertext, actor)
	return err
}

// Status returns the non-secret projection for all channels in a workspace.
func (s Store) Status(ctx context.Context, workspace string) ([]CredentialStatus, error) {
	rows, err := s.Pool.Query(ctx, `SELECT channel_id, base_url, auth_type, enabled, updated_at,
        CASE WHEN octet_length(key_ciphertext) > 0 THEN true ELSE false END AS has_key
        FROM channel_credentials WHERE workspace_id=$1 ORDER BY channel_id`, workspace)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]CredentialStatus, 0)
	for rows.Next() {
		var cs CredentialStatus
		var updated time.Time
		if err := rows.Scan(&cs.ChannelID, &cs.BaseURL, &cs.AuthType, &cs.Enabled, &updated, &cs.HasKey); err != nil {
			return nil, err
		}
		cs.UpdatedAt = updated.UTC().Format(time.RFC3339)
		items = append(items, cs)
	}
	return items, rows.Err()
}

// RevealKey decrypts the stored key for explicit owner-side display
// (used only by the reveal endpoint; never in list/status projections).
func (s Store) RevealKey(ctx context.Context, workspace, channelID string) (string, string, string, error) {
	base, key, err := s.ProbeKey(ctx, workspace, channelID)
	if err != nil {
		return "", "", "", err
	}
	var auth string
	_ = s.Pool.QueryRow(ctx, `SELECT auth_type FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID).Scan(&auth)
	return base, auth, key, nil
}

// Delete removes a channel credential row entirely.
func (s Store) DeleteCredential(ctx context.Context, workspace, channelID string) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID)
	return err
}

// KeyAvailable reports whether a channel has a stored API key (for probe flows).
func (s Store) KeyAvailable(ctx context.Context, workspace, channelID string) (bool, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM channel_credentials
        WHERE workspace_id=$1 AND channel_id=$2 AND enabled AND octet_length(key_ciphertext) > 0`, workspace, channelID).Scan(&n)
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// ProbeKey decrypts the stored key for a channel (used only inside the
// execution boundary, never returned to clients).
func (s Store) ProbeKey(ctx context.Context, workspace, channelID string) (string, string, error) {
	var base, auth string
	var ciphertext []byte
	err := s.Pool.QueryRow(ctx, `SELECT base_url, auth_type, key_ciphertext FROM channel_credentials
        WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID).
		Scan(&base, &auth, &ciphertext)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", "", ErrCredentialNotFound
	}
	if err != nil {
		return "", "", err
	}
	if len(ciphertext) == 0 {
		return base, auth, ErrCredentialNotFound
	}
	key, err := decryptSecret(ciphertext)
	if err != nil {
		return base, auth, err
	}
	return base, key, nil
}
