/**
 * TimeSeriesTypes.ts
 * 
 * This file contains TypeScript type definitions for advanced time series operations
 * that integrate with Julia's AdvancedTimeSeries module.
 */

import { z } from 'zod';

// ===== Basic Time Series Types =====

/**
 * Time series data point with timestamp and value
 */
export interface TimeSeriesPoint {
  timestamp: Date | number | string;
  value: number;
}

/**
 * Time series data with multiple observations
 */
export interface TimeSeries {
  points: TimeSeriesPoint[];
  name?: string;
  frequency?: string;
  metadata?: Record<string, any>;
}

/**
 * Multivariate time series with multiple variables
 */
export interface MultivariateTimeSeries {
  timestamps: Array<Date | number | string>;
  series: Record<string, number[]>;
  frequency?: string;
  metadata?: Record<string, any>;
}

// ===== Feature Extraction Types =====

/**
 * Result of time series feature extraction
 */
export interface FeatureExtractionResult {
  features: Record<string, number>;
  featureDescriptions: Record<string, string>;
}

// ===== Decomposition Types =====

/**
 * Available decomposition methods
 */
export type DecompositionMethod = 'stl' | 'x11' | 'seasonal';

/**
 * Configuration for time series decomposition
 */
export interface DecompositionConfig {
  method: DecompositionMethod;
  period?: number;
  robust?: boolean;
}

/**
 * Result of time series decomposition
 */
export interface DecompositionResult {
  trend: number[];
  seasonal: number[];
  residual: number[];
  original: number[];
}

// ===== Forecasting Types =====

/**
 * Available forecasting methods
 */
export type ForecastMethod = 
  | 'arima'
  | 'prophet'
  | 'exponential_smoothing'
  | 'var'
  | 'lstm';

/**
 * Base forecast configuration
 */
export interface BaseForecastConfig {
  method: ForecastMethod;
  horizon: number;
}

/**
 * ARIMA forecast configuration
 */
export interface ARIMAConfig extends BaseForecastConfig {
  method: 'arima';
  order: [number, number, number]; // [p, d, q]
}

/**
 * Prophet forecast configuration
 */
export interface ProphetConfig extends BaseForecastConfig {
  method: 'prophet';
}

/**
 * Exponential smoothing forecast configuration
 */
export interface ExponentialSmoothingConfig extends BaseForecastConfig {
  method: 'exponential_smoothing';
  seasonalPeriods?: number;
  alpha?: number;
  beta?: number;
  gamma?: number;
}

/**
 * VAR forecast configuration
 */
export interface VARConfig extends BaseForecastConfig {
  method: 'var';
  lags?: number;
}

/**
 * LSTM forecast configuration
 */
export interface LSTMConfig extends BaseForecastConfig {
  method: 'lstm';
  lookback?: number;
}

/**
 * Union type for all forecast configurations
 */
export type ForecastConfig = 
  | ARIMAConfig
  | ProphetConfig
  | ExponentialSmoothingConfig
  | VARConfig
  | LSTMConfig;

/**
 * Forecast result
 */
export interface ForecastResult {
  forecast: number[];
  lowerBound?: number[];
  upperBound?: number[];
  timestamps?: Array<Date | string>;
}

// ===== Anomaly Detection Types =====

/**
 * Available anomaly detection methods
 */
export type AnomalyDetectionMethod = 
  | 'zscore'
  | 'iqr'
  | 'isolation_forest' 
  | 'lstm';

/**
 * Configuration for anomaly detection
 */
export interface AnomalyDetectionConfig {
  method: AnomalyDetectionMethod;
  threshold?: number;
}

/**
 * Result of anomaly detection
 */
export interface AnomalyDetectionResult {
  anomalies: number[];  // Indices of anomalies
  scores?: number[];    // Anomaly scores for each point
}

// ===== Validation Schemas =====

/**
 * Zod validation schema for time series data
 */
export const TimeSeriesSchema = z.object({
  points: z.array(z.object({
    timestamp: z.union([z.date(), z.number(), z.string()]),
    value: z.number()
  })),
  name: z.string().optional(),
  frequency: z.string().optional(),
  metadata: z.record(z.any()).optional()
});

/**
 * Zod validation schema for decomposition configuration
 */
export const DecompositionConfigSchema = z.object({
  method: z.enum(['stl', 'x11', 'seasonal']),
  period: z.number().positive().optional(),
  robust: z.boolean().optional()
});

/**
 * Zod validation schema for forecast configuration (union type)
 */
export const ForecastConfigSchema = z.object({
  method: z.enum(['arima', 'prophet', 'exponential_smoothing', 'var', 'lstm']),
  horizon: z.number().positive(),
  order: z.tuple([z.number(), z.number(), z.number()]).optional(),
  seasonalPeriods: z.number().positive().optional(),
  alpha: z.number().min(0).max(1).optional(),
  beta: z.number().min(0).max(1).optional(),
  gamma: z.number().min(0).max(1).optional(),
  lags: z.number().positive().optional(),
  lookback: z.number().positive().optional()
});

/**
 * Zod validation schema for anomaly detection configuration
 */
export const AnomalyDetectionConfigSchema = z.object({
  method: z.enum(['zscore', 'iqr', 'isolation_forest', 'lstm']),
  threshold: z.number().optional()
}); 