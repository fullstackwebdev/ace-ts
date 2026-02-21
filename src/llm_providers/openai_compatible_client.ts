/**
 * OpenAI-compatible LLM client for ACE Framework.
 * 
 * This module re-exports the OpenAICompatibleClient from the main llm module
 * for backward compatibility and organized imports.
 */

export {
  OpenAICompatibleClient,
  type OpenAICompatibleClientConfig,
  createLLMClient,
} from "../llm.js";
