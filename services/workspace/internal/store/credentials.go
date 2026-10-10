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
//
// AuthHeader/AuthPrefix are advisory knobs (ADR-007 D2), not secrets: they tell
// the caller which header name and prefix to use. Either may be nil when the
// tenant has not opted into data-driven auth, in which case the runtime falls
// back to the auth_type mapping.
type CredentialStatus struct {
	ChannelID  string  `json:"channelId"`
	BaseURL    string  `json:"baseUrl"`
	AuthType   string  `json:"authType"`
	AuthHeader *string `json:"authHeader"`
	AuthPrefix *string `json:"authPrefix"`
	HasKey     bool    `json:"hasKey"`
	Enabled    bool    `json:"enabled"`
	UpdatedAt  string  `json:"updatedAt"`
}

// Credential is the write-side payload for PutCredential. AuthHeader/AuthPrefix
// are optional: nil keeps the stored value (and on insert stores SQL NULL).
type Credential struct {
	WorkspaceID string
	ChannelID   string
	BaseURL     string
	AuthType    string
	AuthHeader  *string
	AuthPrefix  *string
	APIKey      string
	Actor       string
}

// RevealedCredential is the decrypted credential projection used by the reveal
// endpoint and the internal reveal path consumed by execution.
//
// Rediscovered pitfall: auth_header/auth_prefix are nullable text columns. pgx
// rejects scanning SQL NULL into a string, so these are *string on the way out
// and callers flatten to "" (see CredentialAuthFields / the execution client).
type RevealedCredential struct {
	BaseURL    string
	AuthType   string
	AuthHeader *string
	AuthPrefix *string
	APIKey     string
}

// AuthHeaderValue flattens a nullable credential column to the runtime string
// the engine expects: NULL and "" are equivalent (both mean "not configured").
func AuthHeaderValue(v *string) string {
	if v == nil {
		return ""
	}
	return *v
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

// keepOr returns incoming when explicitly provided, otherwise the stored value.
// Used so a PUT that omits auth_header/auth_prefix preserves the existing choice
// instead of silently dropping it.
func keepOr(incoming, existing *string) *string {
	if incoming != nil {
		return incoming
	}
	return existing
}

// Put stores or replaces a channel credential. Empty apiKey clears the key
// (keeps base_url/auth_type/auth_header/auth_prefix); empty baseURL clears the
// whole row. A nil AuthHeader/AuthPrefix keeps the stored value (NULL on insert).
func (s Store) PutCredential(ctx context.Context, in Credential) error {
	if in.BaseURL == "" && in.APIKey == "" {
		// full clear
		_, err := s.Pool.Exec(ctx, `DELETE FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, in.WorkspaceID, in.ChannelID)
		return err
	}
	if in.BaseURL == "" {
		return errors.New("base_url is required when storing credentials")
	}
	// fetch existing row first so clearing just the key keeps base_url/auth_type
	var existingBase, existingAuth string
	var existingHeader, existingPrefix *string
	var existingCipher []byte
	err := s.Pool.QueryRow(ctx, `SELECT base_url, auth_type, auth_header, auth_prefix, key_ciphertext FROM channel_credentials WHERE workspace_id=$1 AND channel_id=$2`, in.WorkspaceID, in.ChannelID).
		Scan(&existingBase, &existingAuth, &existingHeader, &existingPrefix, &existingCipher)
	rowExists := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	finalBase, finalAuth := in.BaseURL, in.AuthType
	if in.BaseURL == "" {
		finalBase = existingBase
	}
	if in.AuthType == "" {
		finalAuth = existingAuth
	}
	finalHeader := keepOr(in.AuthHeader, existingHeader)
	finalPrefix := keepOr(in.AuthPrefix, existingPrefix)

	var ciphertext []byte
	if in.APIKey != "" {
		ciphertext, err = encryptSecret(in.APIKey)
		if err != nil {
			return err
		}
	} else if rowExists {
		ciphertext = existingCipher
	} else {
		return errors.New("api_key is required for a new credential row")
	}

	if rowExists {
		_, err = s.Pool.Exec(ctx, `UPDATE channel_credentials SET base_url=$3, auth_type=$4, auth_header=$5, auth_prefix=$6, key_ciphertext=$7, enabled=true, updated_by=$8, updated_at=now()
            WHERE workspace_id=$1 AND channel_id=$2`, in.WorkspaceID, in.ChannelID, finalBase, finalAuth, finalHeader, finalPrefix, ciphertext, in.Actor)
		return err
	}
	_, err = s.Pool.Exec(ctx, `INSERT INTO channel_credentials (workspace_id, channel_id, base_url, auth_type, auth_header, auth_prefix, key_ciphertext, enabled, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`, in.WorkspaceID, in.ChannelID, finalBase, finalAuth, finalHeader, finalPrefix, ciphertext, in.Actor)
	return err
}

// Status returns the non-secret projection for all channels in a workspace.
func (s Store) Status(ctx context.Context, workspace string) ([]CredentialStatus, error) {
	rows, err := s.Pool.Query(ctx, `SELECT channel_id, base_url, auth_type, auth_header, auth_prefix, enabled, updated_at,
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
		// auth_header/auth_prefix are nullable text: scan into *string so a NULL
		// row does not fail the whole status listing.
		if err := rows.Scan(&cs.ChannelID, &cs.BaseURL, &cs.AuthType, &cs.AuthHeader, &cs.AuthPrefix, &cs.Enabled, &updated, &cs.HasKey); err != nil {
			return nil, err
		}
		cs.UpdatedAt = updated.UTC().Format(time.RFC3339)
		items = append(items, cs)
	}
	return items, rows.Err()
}

// RevealKey decrypts the stored key for explicit owner-side display
// (used only by the reveal endpoint; never in list/status projections).
func (s Store) RevealKey(ctx context.Context, workspace, channelID string) (RevealedCredential, error) {
	revealed, err := s.ProbeKey(ctx, workspace, channelID)
	if err != nil {
		return RevealedCredential{}, err
	}
	// ProbeKey already loads every column; nothing else to do but hand it back.
	return revealed, nil
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
func (s Store) ProbeKey(ctx context.Context, workspace, channelID string) (RevealedCredential, error) {
	var base, auth string
	var header, prefix *string
	var ciphertext []byte
	err := s.Pool.QueryRow(ctx, `SELECT base_url, auth_type, auth_header, auth_prefix, key_ciphertext FROM channel_credentials
        WHERE workspace_id=$1 AND channel_id=$2`, workspace, channelID).
		Scan(&base, &auth, &header, &prefix, &ciphertext)
	if errors.Is(err, pgx.ErrNoRows) {
		return RevealedCredential{}, ErrCredentialNotFound
	}
	if err != nil {
		return RevealedCredential{}, err
	}
	if len(ciphertext) == 0 {
		return RevealedCredential{BaseURL: base, AuthType: auth, AuthHeader: header, AuthPrefix: prefix}, ErrCredentialNotFound
	}
	key, err := decryptSecret(ciphertext)
	if err != nil {
		return RevealedCredential{BaseURL: base, AuthType: auth, AuthHeader: header, AuthPrefix: prefix}, err
	}
	return RevealedCredential{BaseURL: base, AuthType: auth, AuthHeader: header, AuthPrefix: prefix, APIKey: key}, nil
}
