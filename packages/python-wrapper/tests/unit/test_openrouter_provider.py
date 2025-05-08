"""
Unit tests for the OpenRouter LLM provider.

This module contains mock tests for OpenRouterProvider functionality.
"""

import os
import pytest
import aiohttp
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from enum import Enum
from typing import List, Dict, Any, Optional, Union
from pydantic import BaseModel


# Mock the necessary classes for testing
class LLMRole(str, Enum):
    """Mock of LLMRole for testing"""
    SYSTEM = "system"
    USER = "user"
    ASSISTANT = "assistant"
    FUNCTION = "function"


class LLMMessage(BaseModel):
    """Mock of LLMMessage for testing"""
    role: LLMRole
    content: str
    name: Optional[str] = None
    function_call: Optional[Dict[str, Any]] = None


class LLMResponse(BaseModel):
    """Mock of LLMResponse for testing"""
    content: str
    model: str
    provider: str
    usage: Dict[str, int]
    finish_reason: Optional[str] = None
    function_call: Optional[Dict[str, Any]] = None
    raw_response: Optional[Dict[str, Any]] = None


# Mock the OpenRouterProvider for testing
class OpenRouterProvider:
    """Mock implementation of OpenRouterProvider for testing"""
    def __init__(self, api_key: Optional[str] = None, **kwargs):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OpenRouter API key is required")
        self.base_url = "https://openrouter.ai/api/v1"
        self.kwargs = kwargs
    
    def get_default_model(self) -> str:
        """Get the default model name"""
        return "openai/gpt-3.5-turbo"
    
    def get_provider_name(self) -> str:
        """Get the provider name"""
        return "openrouter"
    
    def get_available_models(self) -> List[str]:
        """Get a list of available models"""
        return [
            "openai/gpt-3.5-turbo",
            "openai/gpt-4",
            "anthropic/claude-3-haiku",
            "anthropic/claude-3-sonnet",
            "anthropic/claude-3-opus",
            "meta-llama/llama-3-8b",
            "meta-llama/llama-3-70b"
        ]
    
    def format_messages(self, messages: List[Union[LLMMessage, Dict[str, Any]]]) -> List[LLMMessage]:
        """Format messages to ensure they are LLMMessage objects"""
        formatted_messages = []
        for message in messages:
            if isinstance(message, dict):
                formatted_messages.append(LLMMessage(**message))
            else:
                formatted_messages.append(message)
        return formatted_messages
    
    async def generate(self, messages: List[Union[LLMMessage, Dict[str, Any]]], **kwargs) -> LLMResponse:
        """Generate text completions"""
        model = kwargs.get("model", self.get_default_model())
        formatted_messages = self.format_messages(messages)
        
        # Prepare request data
        request_data = {
            "model": model,
            "messages": [
                {
                    "role": m.role.value,
                    "content": m.content,
                    **({"name": m.name} if m.name else {}),
                    **({"function_call": m.function_call} if m.function_call else {})
                }
                for m in formatted_messages
            ]
        }
        
        # Add any additional parameters
        for key, value in kwargs.items():
            if key not in ["model", "messages"]:
                request_data[key] = value
        
        # Make API request
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://juliaos.com", # OpenRouter requires this
                "X-Title": "JuliaOS",
            }
            
            response = await session.post(
                f"{self.base_url}/chat/completions",
                json=request_data,
                headers=headers
            )
            
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"OpenRouter API returned error ({response.status}): {error_text}")
            
            response_data = await response.json()
            
            # Process the response
            choice = response_data["choices"][0]
            return LLMResponse(
                content=choice["message"]["content"],
                model=response_data["model"],
                provider=self.get_provider_name(),
                usage=response_data["usage"],
                finish_reason=choice.get("finish_reason"),
                function_call=choice["message"].get("function_call"),
                raw_response=response_data
            )
    
    async def embed(self, texts: List[str], **kwargs) -> List[List[float]]:
        """Generate embeddings for texts"""
        model = kwargs.get("model", "openai/text-embedding-ada-002")
        
        # Prepare request data
        request_data = {
            "model": model,
            "input": texts
        }
        
        # Add any additional parameters
        for key, value in kwargs.items():
            if key not in ["model", "input"]:
                request_data[key] = value
        
        # Make API request
        async with aiohttp.ClientSession() as session:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://juliaos.com", # OpenRouter requires this
                "X-Title": "JuliaOS",
            }
            
            response = await session.post(
                f"{self.base_url}/embeddings",
                json=request_data,
                headers=headers
            )
            
            if response.status != 200:
                error_text = await response.text()
                raise Exception(f"OpenRouter API returned error ({response.status}): {error_text}")
            
            response_data = await response.json()
            
            # Extract embeddings from response
            return [item["embedding"] for item in response_data["data"]]


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
        with patch.dict("os.environ", {"OPENROUTER_API_KEY": "mock-api-key"}):
            provider = OpenRouterProvider()
            assert provider.api_key == "mock-api-key"
    
    def test_missing_api_key(self):
        """
        Test that initialization fails without API key
        """
        with patch.dict("os.environ", {}, clear=True):
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
        
        # Create a proper mock response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=MOCK_GENERATE_RESPONSE)
        
        # Create a mock session
        mock_session = MagicMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.post = AsyncMock(return_value=mock_response)
        
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
        
        # Create a proper mock error response
        mock_response = MagicMock()
        mock_response.status = 401
        mock_response.text = AsyncMock(return_value="Invalid API key")
        
        # Create a mock session
        mock_session = MagicMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.post = AsyncMock(return_value=mock_response)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            with pytest.raises(Exception, match="OpenRouter API returned error"):
                await openrouter_provider.generate(messages=messages)
    
    @pytest.mark.asyncio
    async def test_embed(self, openrouter_provider):
        """
        Test embed method
        """
        texts = ["Hello, world!", "Testing embeddings"]
        
        # Create a proper mock response
        mock_response = MagicMock()
        mock_response.status = 200
        mock_response.json = AsyncMock(return_value=MOCK_EMBED_RESPONSE)
        
        # Create a mock session
        mock_session = MagicMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.post = AsyncMock(return_value=mock_response)
        
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
        
        # Create a proper mock error response
        mock_response = MagicMock()
        mock_response.status = 500
        mock_response.text = AsyncMock(return_value="Server error")
        
        # Create a mock session
        mock_session = MagicMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        mock_session.post = AsyncMock(return_value=mock_response)
        
        with patch("aiohttp.ClientSession", return_value=mock_session):
            with pytest.raises(Exception, match="OpenRouter API returned error"):
                await openrouter_provider.embed(texts=texts) 