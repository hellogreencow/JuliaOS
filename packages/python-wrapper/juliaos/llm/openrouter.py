"""
OpenRouter LLM provider.

This module provides the OpenRouter LLM provider, which gives access to
a wide variety of LLMs through a single unified API.
"""

import os
from typing import List, Dict, Any, Optional, Union
import aiohttp
import json

from .base import LLMProvider, LLMResponse, LLMMessage, LLMRole


class OpenRouterProvider(LLMProvider):
    """
    OpenRouter LLM provider.
    
    OpenRouter provides access to a variety of LLMs through a single API.
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        **kwargs
    ):
        """
        Initialize the OpenRouter provider.
        
        Args:
            api_key: OpenRouter API key
            base_url: Base URL for the OpenRouter API
            **kwargs: Additional provider-specific arguments
        """
        super().__init__(api_key, **kwargs)
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            raise ValueError("OpenRouter API key is required")
        
        self.base_url = base_url or os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    
    async def generate(
        self,
        messages: List[Union[LLMMessage, Dict[str, Any]]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        functions: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> LLMResponse:
        """
        Generate a response from the OpenRouter API.
        
        Args:
            messages: List of messages in the conversation
            model: Model to use for generation
            temperature: Temperature for generation
            max_tokens: Maximum number of tokens to generate
            functions: List of function definitions for function calling
            **kwargs: Additional provider-specific arguments
        
        Returns:
            LLMResponse: The generated response
        """
        # Format messages
        formatted_messages = self.format_messages(messages)
        
        # Convert messages to OpenRouter format (same format as OpenAI)
        openrouter_messages = []
        for message in formatted_messages:
            openrouter_message = {
                "role": message.role,
                "content": message.content
            }
            if message.name:
                openrouter_message["name"] = message.name
            openrouter_messages.append(openrouter_message)
        
        # Prepare request payload
        payload = {
            "model": model or self.get_default_model(),
            "messages": openrouter_messages,
            "temperature": temperature,
        }
        
        if max_tokens:
            payload["max_tokens"] = max_tokens
        
        if functions:
            payload["functions"] = functions
        
        # Add additional kwargs
        for key, value in kwargs.items():
            payload[key] = value
        
        # Add OpenRouter-specific headers
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": kwargs.get("http_referer", "https://juliaos.ai"),  # Optional: your site URL
            "X-Title": kwargs.get("x_title", "JuliaOS")  # Optional: your app name
        }
        
        # Make API request
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload
            ) as response:
                # Check for error responses
                if response.status != 200:
                    error_text = await response.text()
                    raise Exception(f"OpenRouter API returned error: {response.status} - {error_text}")
                
                # Parse response
                data = await response.json()
                
                # Extract response content
                content = data["choices"][0]["message"]["content"]
                
                # Extract usage information
                usage = {
                    "prompt_tokens": data.get("usage", {}).get("prompt_tokens", 0),
                    "completion_tokens": data.get("usage", {}).get("completion_tokens", 0),
                    "total_tokens": data.get("usage", {}).get("total_tokens", 0)
                }
                
                # Create response object
                return LLMResponse(
                    content=content,
                    model=data.get("model", model or self.get_default_model()),
                    provider="openrouter",
                    usage=usage,
                    finish_reason=data["choices"][0].get("finish_reason"),
                    function_call=data["choices"][0]["message"].get("function_call"),
                    raw_response=data
                )
    
    async def embed(
        self,
        texts: List[str],
        model: Optional[str] = None,
        **kwargs
    ) -> List[List[float]]:
        """
        Generate embeddings for the given texts.
        
        Args:
            texts: List of texts to embed
            model: Model to use for embedding
            **kwargs: Additional provider-specific arguments
        
        Returns:
            List[List[float]]: List of embeddings
        """
        # OpenRouter supports embeddings with a similar API to OpenAI
        embed_model = model or "openai/text-embedding-ada-002"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": kwargs.get("http_referer", "https://juliaos.ai"),
            "X-Title": kwargs.get("x_title", "JuliaOS")
        }
        
        embeddings = []
        # Process in batches to avoid API limits
        batch_size = kwargs.get("batch_size", 16)
        
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            
            payload = {
                "model": embed_model,
                "input": batch
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    f"{self.base_url}/embeddings",
                    headers=headers,
                    json=payload
                ) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"OpenRouter API returned error: {response.status} - {error_text}")
                    
                    data = await response.json()
                    batch_embeddings = [item["embedding"] for item in data["data"]]
                    embeddings.extend(batch_embeddings)
        
        return embeddings
    
    def get_default_model(self) -> str:
        """
        Get the default model for OpenRouter.
        
        Returns:
            str: The default model name
        """
        return "openai/gpt-3.5-turbo"  # A common default, but can be changed
    
    def get_available_models(self) -> List[str]:
        """
        Get the available models for OpenRouter.
        
        This is a subset of commonly used models. OpenRouter supports many more.
        Check their documentation for the full list.
        
        Returns:
            List[str]: List of available model names
        """
        return [
            # OpenAI models via OpenRouter
            "openai/gpt-3.5-turbo",
            "openai/gpt-4",
            "openai/gpt-4-turbo",
            # Anthropic models
            "anthropic/claude-3-opus",
            "anthropic/claude-3-sonnet",
            "anthropic/claude-3-haiku",
            # Mistral models
            "mistral/mistral-7b",
            "mistral/mixtral-8x7b",
            "mistral/mistral-large",
            # Meta models
            "meta/llama-3-70b",
            "meta/llama-3-8b",
            # Other popular models
            "google/gemini-pro",
            "google/gemini-ultra",
            "cohere/command-r",
            "cohere/command-r-plus"
        ]
    
    def get_provider_name(self) -> str:
        """
        Get the name of this provider.
        
        Returns:
            str: The provider name
        """
        return "openrouter" 