package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"shotdesigner/services/asset/internal/asset"
	"shotdesigner/services/asset/internal/httpapi"
)

func main() {
	dsn := os.Getenv("ASSET_DATABASE_URL")
	token := os.Getenv("ASSET_INTERNAL_TOKEN")
	endpoint := env("ASSET_S3_ENDPOINT", "minio:9000")
	bucket := env("ASSET_S3_BUCKET", "assets")
	if dsn == "" || token == "" {
		log.Fatal("ASSET_DATABASE_URL and ASSET_INTERNAL_TOKEN must be set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	p, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer p.Close()
	if err := p.Ping(ctx); err != nil {
		log.Fatal(err)
	}
	mc, err := minio.New(endpoint, &minio.Options{Creds: credentials.NewStaticV4(os.Getenv("ASSET_S3_ACCESS_KEY"), os.Getenv("ASSET_S3_SECRET_KEY"), ""), Secure: false})
	if err != nil {
		log.Fatal(err)
	}
	if err := mc.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
		exists, _ := mc.BucketExists(ctx, bucket)
		if !exists {
			log.Fatal(err)
		}
	}
	max := int64(100 * 1024 * 1024)
	if v, err := strconv.ParseInt(os.Getenv("ASSET_MAX_BYTES"), 10, 64); err == nil && v > 0 {
		max = v
	}
	h := httpapi.Handler{Store: asset.Store{Pool: p, Object: mc, Bucket: bucket, MaxBytes: max}, Token: token, Ready: p.Ping}
	addr := env("ASSET_LISTEN_ADDR", "0.0.0.0:8084")
	log.Printf("asset service listening on %s", addr)
	log.Fatal((&http.Server{Addr: addr, Handler: h.Routes(), ReadHeaderTimeout: 5 * time.Second}).ListenAndServe())
}
func env(k, f string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return f
}
