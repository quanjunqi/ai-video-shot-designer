package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"shotdesigner/services/production/internal/catalog"
	"shotdesigner/services/production/internal/episode"
	"shotdesigner/services/production/internal/episodeasset"
	"shotdesigner/services/production/internal/httpapi"
	"shotdesigner/services/production/internal/intent"
	"shotdesigner/services/production/internal/project"
	"shotdesigner/services/production/internal/projectcharacter"
	"shotdesigner/services/production/internal/ruletemplate"
	"shotdesigner/shared/netguard"
)

func main() {
	databaseURL := os.Getenv("PRODUCTION_DATABASE_URL")
	token := os.Getenv("PRODUCTION_INTERNAL_TOKEN")
	if databaseURL == "" || token == "" {
		log.Fatal("PRODUCTION_DATABASE_URL and PRODUCTION_INTERNAL_TOKEN must be set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	// ── 上游同步器（① 的第①步）───────────────────────────────────────────────
	// 没有 PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN 时**不装配**：
	// 路由会以 503 如实拒绝，而不是"同步成功但什么都没拉"。
	// 出站走共享 netguard，且用 PRODUCTION_ 前缀的变量（与 execution 的 EXECUTION_ 分开，
	// 否则一个服务的私网开关会顺带打开另一个服务的）。
	syncPolicy := netguard.FromEnvWithPrefix("PRODUCTION", os.Getenv)
	var channelSyncer httpapi.ChannelSyncer
	if wsURL, wsToken := os.Getenv("PRODUCTION_WORKSPACE_URL"), os.Getenv("PRODUCTION_WORKSPACE_TOKEN"); wsURL != "" && wsToken != "" {
		channelSyncer = catalog.Syncer{
			Store:       catalog.PostgresStore{Pool: pool},
			Credentials: catalog.NewWorkspaceCredentials(wsURL, wsToken, 10*time.Second),
			Lister:      catalog.NewHTTPLister(syncPolicy, 30*time.Second),
		}
	} else {
		log.Printf("production: 上游同步器【未启用】（需 PRODUCTION_WORKSPACE_URL / PRODUCTION_WORKSPACE_TOKEN）")
	}

	handler := httpapi.Handler{
		Store:                 project.PostgresStore{Pool: pool},
		EpisodeStore:          episode.PostgresStore{Pool: pool},
		EpisodeAssetStore:     episodeasset.PostgresStore{Pool: pool},
		ProjectCharacterStore: projectcharacter.PostgresStore{Pool: pool},
		RuleTemplateStore:     ruletemplate.PostgresStore{Pool: pool},
		IntentStore:           intent.PostgresStore{Pool: pool},
		CatalogStore:          catalog.PostgresStore{Pool: pool},
		LogicalModelStore:     catalog.PostgresStore{Pool: pool},
		ChannelSyncer:         channelSyncer,
		Token:                 token,
		Ready:                 pool.Ping,
	}
	addr := os.Getenv("PRODUCTION_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           handler.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("production internal API listening on %s", addr)
	log.Fatal(server.ListenAndServe())
}
