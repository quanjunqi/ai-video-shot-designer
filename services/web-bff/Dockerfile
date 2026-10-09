FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/web-bff ./cmd/server
FROM alpine:3.21
RUN addgroup -S app && adduser -S -G app app
USER app
COPY --from=build /out/web-bff /usr/local/bin/web-bff
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/web-bff"]
