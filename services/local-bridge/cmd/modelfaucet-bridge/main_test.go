package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealth(t *testing.T) {
	handler := newBridgeHandler(config{listenAddress: "127.0.0.1:8787", upstreamBaseURL: "http://127.0.0.1:11434/v1"})

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", response.Code)
	}

	var body healthResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if !body.OK || body.Version != version || body.Listening != "127.0.0.1:8787" {
		t.Fatalf("unexpected health body: %#v", body)
	}
}

func TestModelsProxy(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/models" {
			t.Fatalf("unexpected upstream path %s", request.URL.Path)
		}
		writer.Header().Set("content-type", "application/json")
		_, _ = writer.Write([]byte(`{"object":"list","data":[{"id":"qwen2.5:7b"}]}`))
	}))
	defer upstream.Close()

	handler := newBridgeHandler(config{listenAddress: "127.0.0.1:8787", upstreamBaseURL: upstream.URL + "/v1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/models", nil)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}

	var body modelsResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if len(body.Items) != 1 || body.Items[0].ID != "ollama:qwen2.5:7b" {
		t.Fatalf("unexpected models body: %#v", body)
	}
}

func TestChatCompletionsProxy(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/v1/chat/completions" {
			t.Fatalf("unexpected upstream path %s", request.URL.Path)
		}
		if request.Header.Get("authorization") != "Bearer ollama" {
			t.Fatalf("missing upstream auth header")
		}

		var body map[string]any
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["model"] != "qwen2.5:7b" {
			t.Fatalf("expected stripped model, got %#v", body["model"])
		}

		writer.Header().Set("content-type", "application/json")
		_, _ = writer.Write([]byte(`{"id":"chatcmpl_local","choices":[{"message":{"role":"assistant","content":"local response"}}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}`))
	}))
	defer upstream.Close()

	handler := newBridgeHandler(config{
		listenAddress:   "127.0.0.1:8787",
		upstreamBaseURL: upstream.URL + "/v1",
		upstreamAPIKey:  "ollama",
	})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/chat/completions",
		strings.NewReader(`{"model":"ollama:qwen2.5:7b","messages":[{"role":"user","content":"hello"}]}`),
	)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), "local response") {
		t.Fatalf("unexpected chat response: %s", response.Body.String())
	}
}

func TestUsageReport(t *testing.T) {
	handler := newBridgeHandler(config{listenAddress: "127.0.0.1:8787", upstreamBaseURL: "http://127.0.0.1:11434/v1"})
	response := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodPost,
		"/usage/report",
		strings.NewReader(`{"request_id":"req_local_123","route_mode":"local","provider":"ollama","model":"qwen2.5:7b","input_tokens":10,"output_tokens":5}`),
	)
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"ok":true`) {
		t.Fatalf("unexpected usage report response: %s", response.Body.String())
	}
}

func TestListenAddressIsLoopback(t *testing.T) {
	if listenAddress(8787) != "127.0.0.1:8787" {
		t.Fatalf("bridge must bind to loopback by default")
	}
}
