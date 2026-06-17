package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const version = "0.1.0"

type config struct {
	listenAddress   string
	upstreamBaseURL string
	upstreamAPIKey  string
	httpClient      *http.Client
}

type bridgeServer struct {
	config config
}

type healthResponse struct {
	OK        bool   `json:"ok"`
	Version   string `json:"version"`
	Listening string `json:"listening"`
}

type modelsResponse struct {
	Items []modelSummary `json:"items"`
}

type modelSummary struct {
	ID           string   `json:"id"`
	Provider     string   `json:"provider"`
	EndpointID   string   `json:"endpoint_id"`
	Capabilities []string `json:"capabilities"`
}

type usageReport struct {
	RequestID     string `json:"request_id"`
	AppID         string `json:"app_id"`
	EndUserIDHash string `json:"end_user_id_hash"`
	FeatureKey    string `json:"feature_key"`
	RouteMode     string `json:"route_mode"`
	Provider      string `json:"provider"`
	Model         string `json:"model"`
	InputTokens   int    `json:"input_tokens"`
	OutputTokens  int    `json:"output_tokens"`
	CreatedAt     string `json:"created_at"`
}

func main() {
	if len(os.Args) < 2 || os.Args[1] != "start" {
		fmt.Fprintln(os.Stderr, "usage: modelfaucet-bridge start [--port 8787] [--ollama-base-url http://127.0.0.1:11434/v1]")
		os.Exit(2)
	}

	startFlags := flag.NewFlagSet("start", flag.ExitOnError)
	port := startFlags.Int("port", 8787, "loopback port for the local bridge")
	ollamaBaseURL := startFlags.String(
		"ollama-base-url",
		envOrDefault("MODELFAUCET_BRIDGE_OLLAMA_BASE_URL", "http://127.0.0.1:11434/v1"),
		"Ollama OpenAI-compatible base URL",
	)
	upstreamAPIKey := startFlags.String(
		"ollama-api-key",
		envOrDefault("MODELFAUCET_BRIDGE_OLLAMA_API_KEY", "ollama"),
		"Ollama OpenAI-compatible API key",
	)
	if err := startFlags.Parse(os.Args[2:]); err != nil {
		log.Fatal(err)
	}

	listen := listenAddress(*port)
	server := &http.Server{
		Addr:              listen,
		Handler:           newBridgeHandler(config{listenAddress: listen, upstreamBaseURL: *ollamaBaseURL, upstreamAPIKey: *upstreamAPIKey}),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("ModelFaucet Local Bridge listening on http://%s", listen)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func listenAddress(port int) string {
	return fmt.Sprintf("127.0.0.1:%d", port)
}

func newBridgeHandler(cfg config) http.Handler {
	if cfg.httpClient == nil {
		cfg.httpClient = &http.Client{Timeout: 60 * time.Second}
	}

	server := &bridgeServer{config: cfg}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", server.handleHealth)
	mux.HandleFunc("GET /models", server.handleModels)
	mux.HandleFunc("POST /v1/chat/completions", server.handleChatCompletions)
	mux.HandleFunc("POST /usage/report", server.handleUsageReport)
	return mux
}

func (server *bridgeServer) handleHealth(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, healthResponse{
		OK:        true,
		Version:   version,
		Listening: server.config.listenAddress,
	})
}

func (server *bridgeServer) handleModels(writer http.ResponseWriter, request *http.Request) {
	upstreamResponse, err := server.config.httpClient.Get(server.upstreamURL("/models"))
	if err != nil {
		writeError(writer, http.StatusBadGateway, "local_model_unavailable")
		return
	}
	defer upstreamResponse.Body.Close()

	if upstreamResponse.StatusCode < 200 || upstreamResponse.StatusCode >= 300 {
		writeError(writer, http.StatusBadGateway, "local_model_unavailable")
		return
	}

	var payload struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.NewDecoder(upstreamResponse.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadGateway, "invalid_model_response")
		return
	}

	items := make([]modelSummary, 0, len(payload.Data))
	for _, item := range payload.Data {
		if item.ID == "" {
			continue
		}
		items = append(items, modelSummary{
			ID:           "ollama:" + item.ID,
			Provider:     "ollama",
			EndpointID:   "ollama",
			Capabilities: []string{"chat", "json"},
		})
	}

	writeJSON(writer, http.StatusOK, modelsResponse{Items: items})
}

func (server *bridgeServer) handleChatCompletions(writer http.ResponseWriter, request *http.Request) {
	defer request.Body.Close()

	var payload map[string]any
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_request")
		return
	}

	model, ok := payload["model"].(string)
	if !ok || model == "" {
		writeError(writer, http.StatusBadRequest, "missing_model")
		return
	}
	payload["model"] = strings.TrimPrefix(model, "ollama:")

	body, err := json.Marshal(payload)
	if err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_request")
		return
	}

	upstreamRequest, err := http.NewRequest(http.MethodPost, server.upstreamURL("/chat/completions"), bytes.NewReader(body))
	if err != nil {
		writeError(writer, http.StatusBadGateway, "local_model_unavailable")
		return
	}
	upstreamRequest.Header.Set("content-type", "application/json")
	if server.config.upstreamAPIKey != "" {
		upstreamRequest.Header.Set("authorization", "Bearer "+server.config.upstreamAPIKey)
	}

	upstreamResponse, err := server.config.httpClient.Do(upstreamRequest)
	if err != nil {
		writeError(writer, http.StatusBadGateway, "local_model_unavailable")
		return
	}
	defer upstreamResponse.Body.Close()

	copyHeader(writer.Header(), upstreamResponse.Header, "content-type")
	writer.WriteHeader(upstreamResponse.StatusCode)
	if _, err := io.Copy(writer, upstreamResponse.Body); err != nil {
		log.Printf("copy upstream response: %v", err)
	}
}

func (server *bridgeServer) handleUsageReport(writer http.ResponseWriter, request *http.Request) {
	defer request.Body.Close()

	var report usageReport
	if err := json.NewDecoder(request.Body).Decode(&report); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid_usage_report")
		return
	}
	if report.RequestID == "" || report.RouteMode != "local" || report.Provider == "" || report.Model == "" {
		writeError(writer, http.StatusBadRequest, "invalid_usage_report")
		return
	}

	writeJSON(writer, http.StatusOK, map[string]bool{"ok": true})
}

func (server *bridgeServer) upstreamURL(path string) string {
	base, err := url.Parse(server.config.upstreamBaseURL)
	if err != nil {
		return server.config.upstreamBaseURL
	}

	base.Path = strings.TrimRight(base.Path, "/") + path
	base.RawQuery = ""
	return base.String()
}

func writeJSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("content-type", "application/json")
	writer.WriteHeader(status)
	if err := json.NewEncoder(writer).Encode(value); err != nil {
		log.Printf("write json response: %v", err)
	}
}

func writeError(writer http.ResponseWriter, status int, code string) {
	writeJSON(writer, status, map[string]map[string]string{
		"error": {
			"code": code,
		},
	})
}

func copyHeader(destination http.Header, source http.Header, key string) {
	value := source.Get(key)
	if value != "" {
		destination.Set(key, value)
	}
}
