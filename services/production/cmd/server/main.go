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
	"shotdesigner/services/production/internal/probe"
	"shotdesigner/services/production/internal/project"
	"shotdesigner/services/production/internal/projectcharacter"
	"shotdesigner/services/production/internal/ruletemplate"
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
	handler := httpapi.Handler{
		Store:                 project.PostgresStore{Pool: pool},
		EpisodeStore:          episode.PostgresStore{Pool: pool},
		EpisodeAssetStore:     episodeasset.PostgresStore{Pool: pool},
		ProjectCharacterStore: projectcharacter.PostgresStore{Pool: pool},
		RuleTemplateStore:     ruletemplate.PostgresStore{Pool: pool},
		IntentStore:           intent.PostgresStore{Pool: pool},
		CatalogStore:          catalog.PostgresStore{Pool: pool},
		LogicalModelStore:     catalog.PostgresStore{Pool: pool},
		ProbeStore:            probe.Store{Pool: pool},
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
