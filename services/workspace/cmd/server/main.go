package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"shotdesigner/services/workspace/internal/httpapi"
	"shotdesigner/services/workspace/internal/store"
)

func main() {
	dsn, token := os.Getenv("WORKSPACE_DATABASE_URL"), os.Getenv("WORKSPACE_INTERNAL_TOKEN")
	if dsn == "" || token == "" {
		log.Fatal("WORKSPACE_DATABASE_URL and WORKSPACE_INTERNAL_TOKEN must be set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()
	if err := p.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	h := httpapi.Handler{Store: store.Store{Pool: p}, Token: token, Ready: p.Ping}
	addr := os.Getenv("WORKSPACE_LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8082"
	}
	log.Printf("workspace internal API listening on %s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: h.Routes(), ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}
