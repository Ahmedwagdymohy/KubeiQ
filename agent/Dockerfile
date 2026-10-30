# The KubeiQ Agent image (ADR 0017): one static binary on distroless, multi-arch.
#   docker buildx build --platform linux/amd64,linux/arm64 --build-arg VERSION=0.4.0 agent/
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
ARG TARGETOS TARGETARCH VERSION=dev
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /out/kubeiq-agent .

# Has the CA certificates for wss:// and nothing else: no shell, no package manager.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/kubeiq-agent /kubeiq-agent
USER 65532:65532
ENTRYPOINT ["/kubeiq-agent"]
