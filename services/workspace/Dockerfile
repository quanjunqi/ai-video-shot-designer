FROM golang:1.23-alpine AS build
ENV GOPROXY=https://goproxy.cn,direct
WORKDIR /src
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -mod=mod -trimpath -ldflags="-s -w" -o /out/workspace ./cmd/server

FROM alpine:3.21
RUN addgroup -S app && adduser -S -G app app
USER app
COPY --from=build /out/workspace /usr/local/bin/workspace
EXPOSE 8082
ENTRYPOINT ["/usr/local/bin/workspace"]
