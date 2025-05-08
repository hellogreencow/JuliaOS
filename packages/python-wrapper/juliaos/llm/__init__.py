"""
LLM integration module for JuliaOS.

This module provides a unified interface for interacting with various LLM providers.
"""

from .base import LLMProvider, LLMResponse, LLMMessage, LLMRole
from .openai import OpenAIProvider
from .anthropic import AnthropicProvider
from .llama import LlamaProvider
from .mistral import MistralProvider
from .cohere import CohereProvider
from .gemini import GeminiProvider
from .openrouter import OpenRouterProvider

# Dictionary of available LLM providers
AVAILABLE_PROVIDERS = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "llama": LlamaProvider,
    "mistral": MistralProvider,
    "cohere": CohereProvider,
    "gemini": GeminiProvider,
    "openrouter": OpenRouterProvider,
}

__all__ = [
    "LLMProvider", "LLMResponse", "LLMMessage", "LLMRole",
    "OpenAIProvider", "AnthropicProvider", "LlamaProvider",
    "MistralProvider", "CohereProvider", "GeminiProvider",
    "OpenRouterProvider", "AVAILABLE_PROVIDERS"
]
