"""
Example of using OpenRouter LLM provider with JuliaOS.

This example demonstrates how to use OpenRouter with JuliaOS to access
a variety of LLM models through a single API.
"""

import asyncio
import os
from dotenv import load_dotenv

from juliaos import JuliaOS
from juliaos.llm import (
    LLMMessage, LLMRole,
    OpenRouterProvider
)


async def main():
    # Load environment variables (including OPENROUTER_API_KEY)
    load_dotenv()
    
    # Initialize JuliaOS
    juliaos = JuliaOS()
    await juliaos.connect()
    
    print("=== JuliaOS OpenRouter Integration Example ===\n")
    
    # Check if OpenRouter API key is available
    if not os.environ.get("OPENROUTER_API_KEY"):
        print("Error: OPENROUTER_API_KEY environment variable not set.")
        print("To use this example, please set this variable in your .env file or environment.")
        return
    
    # Example messages
    messages = [
        LLMMessage(role=LLMRole.SYSTEM, content="You are a helpful AI assistant specialized in understanding complex systems."),
        LLMMessage(role=LLMRole.USER, content="What are the key advantages of swarm intelligence algorithms?")
    ]
    
    # Initialize OpenRouter provider
    openrouter_provider = OpenRouterProvider()
    
    # Example 1: Using an OpenAI model through OpenRouter
    print("\nExample 1: Using OpenAI's GPT-3.5 Turbo via OpenRouter")
    print("Generating response...")
    openai_response = await openrouter_provider.generate(
        messages=messages,
        model="openai/gpt-3.5-turbo",
        temperature=0.7
    )
    print(f"\nResponse: {openai_response.content}\n")
    print(f"Model: {openai_response.model}")
    print(f"Usage: {openai_response.usage}")
    print("-" * 80)
    
    # Example 2: Using an Anthropic model through OpenRouter
    print("\nExample 2: Using Anthropic's Claude model via OpenRouter")
    print("Generating response...")
    try:
        claude_response = await openrouter_provider.generate(
            messages=messages,
            model="anthropic/claude-3-haiku",
            temperature=0.5
        )
        print(f"\nResponse: {claude_response.content}\n")
        print(f"Model: {claude_response.model}")
        print(f"Usage: {claude_response.usage}")
    except Exception as e:
        print(f"Error accessing Anthropic's Claude model: {e}")
    print("-" * 80)
    
    # Example 3: Using a Mistral model through OpenRouter
    print("\nExample 3: Using Mistral model via OpenRouter")
    print("Generating response...")
    try:
        mistral_response = await openrouter_provider.generate(
            messages=messages,
            model="mistral/mistral-7b",
            temperature=0.7
        )
        print(f"\nResponse: {mistral_response.content}\n")
        print(f"Model: {mistral_response.model}")
        print(f"Usage: {mistral_response.usage}")
    except Exception as e:
        print(f"Error accessing Mistral model: {e}")
    print("-" * 80)
    
    # Example 4: Embeddings through OpenRouter
    print("\nExample 4: Generating embeddings via OpenRouter")
    try:
        texts = [
            "Swarm intelligence uses multiple agents to solve complex problems.",
            "Neural networks are inspired by the human brain."
        ]
        embeddings = await openrouter_provider.embed(texts=texts)
        print(f"Generated {len(embeddings)} embeddings.")
        print(f"First embedding length: {len(embeddings[0])}")
        # Print first few dimensions of first embedding
        print(f"First few dimensions: {embeddings[0][:5]}...")
    except Exception as e:
        print(f"Error generating embeddings: {e}")
    
    print("\n=== Example Complete ===")


if __name__ == "__main__":
    asyncio.run(main()) 