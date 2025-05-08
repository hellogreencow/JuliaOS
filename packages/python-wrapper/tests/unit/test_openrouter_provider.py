"""
Unit tests for the OpenRouter LLM provider.

This module tests the OpenRouterProvider class functionality.
"""

import os
import pytest
import aiohttp
import asyncio
from unittest.mock import patch, MagicMock

from juliaos.llm import OpenRouterProvider, LLMMessage, LLMRole


# Mock response for generate API call
MOCK_GENERATE_RESPONSE = {
    "id": "gen-abc123",
    "object": "chat.completion",
    "created": 1677858242,
    "model": "openai/gpt-3.5-turbo",
    "choices": [
        {
            "message": {
                "role": "assistant",
                "content": "This is a test response from the mocked OpenRouter API.",
            },
            "finish_reason": "stop",
            "index": 0
        }
    ],
    "usage": {
        "prompt_tokens": 15,
        "completion_tokens": 12,
        "total_tokens": 27
    }
}

# Mock response for embeddings API call
MOCK_EMBED_RESPONSE = {
    "object": "list",
    "data": [
        {
            "object": "embedding",
            "embedding": [0.1, 0.2, 0.3, 0.4, 0.5],
            "index": 0
        },
        {
            "object": "embedding",
            "embedding": [0.6, 0.7, 0.8, 0.9, 1.0],
            "index": 1
        }
    ],
    "model": "openai/text-embedding-ada-002",
    "usage": {
        "prompt_tokens": 10,
        "total_tokens": 10
    }
}


class MockResponse:
    """
    Mock aiohttp ClientResponse for testing
    """
    def __init__(self, data, status=200):
        self.data = data
        self.status = status
    
    async def json(self):
        return self.data
    
    async def text(self):
        return str(self.data)
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        pass


@pytest.fixture
def mock_env_openrouter_key(monkeypatch):
    """
    Set up mock environment variable for OpenRouter API key
    """
    monkeypatch.setenv("OPENROUTER_API_KEY", "mock-api-key")


@pytest.fixture
def openrouter_provider():
    """
    Create OpenRouter provider with explicit API key for testing
    """
    return OpenRouterProvider(api_key="test-api-key")


class TestOpenRouterProvider:
    """
    Test suite for the OpenRouterProvider
    """
    
    def test_initialization(self, openrouter_provider):
        """
        Test that the provider initializes correctly
        """
        assert openrouter_provider.api_key == "test-api-key"
        assert openrouter_provider.base_url == "https://openrouter.ai/api/v1"
    
    def test_initialization_from_env(self, mock_env_openrouter_key):
        """
        Test that the provider initializes from environment variables
        """
        provider = OpenRouterProvider()
        assert provider.api_key == "mock-api-key"
    
    def test_missing_api_key(self):
        """
        Test that initialization fails without API key
        """
        with patch.dict(os.environ, {"OPENROUTER_API_KEY": ""}, clear=True):
            with pytest.raises(ValueError, match="OpenRouter API key is required"):
                OpenRouterProvider()
    
    def test_get_default_model(self, openrouter_provider):
        """
        Test the default model is returned correctly
        """
        assert openrouter_provider.get_default_model() == "openai/gpt-3.5-turbo"
    
    def test_get_provider_name(self, openrouter_provider):
        """
        Test the provider name is returned correctly
        """
        assert openrouter_provider.get_provider_name() == "openrouter"
    
    def test_get_available_models(self, openrouter_provider):
        """
        Test available models list
        """
        models = openrouter_provider.get_available_models()
        assert isinstance(models, list)
        assert len(models) > 0
        assert "openai/gpt-3.5-turbo" in models
        assert "anthropic/claude-3-haiku" in models
    
    @pytest.mark.asyncio
    async def test_generate(self, openrouter_provider):
        """
        Test generate method
        """
        messages = [
            LLMMessage(role=LLMRole.SYSTEM, content="You are a helpful assistant."),
            LLMMessage(role=LLMRole.USER, content="Tell me a joke.")
        ]
        
        # Mock the response
        mock_session = MagicMock()
        mock_session.post.return_value = MockResponse(MOCK_GENERATE_RESPONSE)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            response = await openrouter_provider.generate(
                messages=messages,
                model="openai/gpt-3.5-turbo"
            )
            
            # Verify the response
            assert response.content == "This is a test response from the mocked OpenRouter API."
            assert response.model == "openai/gpt-3.5-turbo"
            assert response.provider == "openrouter"
            assert response.usage["prompt_tokens"] == 15
            assert response.usage["completion_tokens"] == 12
            assert response.usage["total_tokens"] == 27
            
            # Verify the API was called correctly
            mock_session.post.assert_called_once()
            url = mock_session.post.call_args[0][0]
            assert url == "https://openrouter.ai/api/v1/chat/completions"
            
            # Check headers for OpenRouter specifics
            headers = mock_session.post.call_args[1]["headers"]
            assert "HTTP-Referer" in headers
            assert "X-Title" in headers
            
            # Check payload
            json_data = mock_session.post.call_args[1]["json"]
            assert json_data["model"] == "openai/gpt-3.5-turbo"
            assert len(json_data["messages"]) == 2
    
    @pytest.mark.asyncio
    async def test_generate_api_error(self, openrouter_provider):
        """
        Test generate method with API error
        """
        messages = [
            LLMMessage(role=LLMRole.USER, content="Hello")
        ]
        
        # Mock error response
        mock_session = MagicMock()
        mock_session.post.return_value = MockResponse({"error": "Invalid API key"}, status=401)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            with pytest.raises(Exception, match="OpenRouter API returned error"):
                await openrouter_provider.generate(messages=messages)
    
    @pytest.mark.asyncio
    async def test_embed(self, openrouter_provider):
        """
        Test embed method
        """
        texts = ["Hello, world!", "Testing embeddings"]
        
        # Mock the response
        mock_session = MagicMock()
        mock_session.post.return_value = MockResponse(MOCK_EMBED_RESPONSE)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            embeddings = await openrouter_provider.embed(texts=texts)
            
            # Verify embeddings
            assert len(embeddings) == 2
            assert len(embeddings[0]) == 5
            assert embeddings[0] == [0.1, 0.2, 0.3, 0.4, 0.5]
            assert embeddings[1] == [0.6, 0.7, 0.8, 0.9, 1.0]
            
            # Verify API call
            mock_session.post.assert_called_once()
            url = mock_session.post.call_args[0][0]
            assert url == "https://openrouter.ai/api/v1/embeddings"
            
            # Check payload
            json_data = mock_session.post.call_args[1]["json"]
            assert json_data["model"] == "openai/text-embedding-ada-002"
            assert json_data["input"] == texts
    
    @pytest.mark.asyncio
    async def test_embed_api_error(self, openrouter_provider):
        """
        Test embed method with API error
        """
        texts = ["Hello, world!"]
        
        # Mock error response
        mock_session = MagicMock()
        mock_session.post.return_value = MockResponse({"error": "Server error"}, status=500)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            with pytest.raises(Exception, match="OpenRouter API returned error"):
                await openrouter_provider.embed(texts=texts) 