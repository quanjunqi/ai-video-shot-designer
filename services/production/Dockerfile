FROM golang:1.23-alpine AS build
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -mod=mod -trimpath -ldflags="-s -w" -o /out/production ./cmd/server

FROM alpine:3.21
RUN addgroup -S app && adduser -S -G app app
USER app
COPY --from=build /out/production /usr/local/bin/production
EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/production"]
