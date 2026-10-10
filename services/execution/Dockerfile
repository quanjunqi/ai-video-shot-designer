FROM golang:1.23-alpine AS build
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/execution ./cmd/server
FROM alpine:3.21
RUN addgroup -S app && adduser -S -G app app
USER app
COPY --from=build /out/execution /usr/local/bin/execution
EXPOSE 8085
ENTRYPOINT ["/usr/local/bin/execution"]
