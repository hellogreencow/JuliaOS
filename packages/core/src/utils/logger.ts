/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

/**
 * Logger configuration interface
 */
export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableTimestamps: boolean;
  timestampFormat: 'iso' | 'locale' | 'unix';
  prefix?: string;
  colors?: boolean;
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: LogLevel.INFO,
  enableConsole: true,
  enableTimestamps: true,
  timestampFormat: 'iso',
  colors: true,
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  reset: '\x1b[0m',
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

/**
 * Logger class for handling application logs
 */
export class Logger {
  private config: LoggerConfig;
  private handlers: Array<(level: LogLevel, message: string, ...args: any[]) => void> = [];

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
  }

  /**
   * Set the log level
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Add a custom log handler
   */
  public addHandler(handler: (level: LogLevel, message: string, ...args: any[]) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Format a log message with timestamp
   */
  private formatMessage(level: LogLevel, message: string): string {
    let prefix = this.config.prefix ? `[${this.config.prefix}] ` : '';
    
    if (this.config.enableTimestamps) {
      let timestamp = '';
      
      switch (this.config.timestampFormat) {
        case 'iso':
          timestamp = new Date().toISOString();
          break;
        case 'locale':
          timestamp = new Date().toLocaleString();
          break;
        case 'unix':
          timestamp = Date.now().toString();
          break;
      }
      
      prefix = `[${timestamp}] ${prefix}`;
    }
    
    let levelStr = '';
    
    switch (level) {
      case LogLevel.DEBUG:
        levelStr = 'DEBUG';
        break;
      case LogLevel.INFO:
        levelStr = 'INFO';
        break;
      case LogLevel.WARN:
        levelStr = 'WARN';
        break;
      case LogLevel.ERROR:
        levelStr = 'ERROR';
        break;
    }
    
    return `${prefix}[${levelStr}] ${message}`;
  }

  /**
   * Get color code for log level
   */
  private getColorForLevel(level: LogLevel): string {
    if (!this.config.colors) {
      return '';
    }
    
    switch (level) {
      case LogLevel.DEBUG:
        return COLORS.cyan;
      case LogLevel.INFO:
        return COLORS.green;
      case LogLevel.WARN:
        return COLORS.yellow;
      case LogLevel.ERROR:
        return COLORS.red;
      default:
        return '';
    }
  }

  /**
   * Log a message with a specific level
   */
  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (level < this.config.level) {
      return;
    }
    
    const formattedMessage = this.formatMessage(level, message);
    
    if (this.config.enableConsole) {
      const color = this.getColorForLevel(level);
      const resetColor = this.config.colors ? COLORS.reset : '';
      
      switch (level) {
        case LogLevel.DEBUG:
          console.debug(`${color}${formattedMessage}${resetColor}`, ...args);
          break;
        case LogLevel.INFO:
          console.info(`${color}${formattedMessage}${resetColor}`, ...args);
          break;
        case LogLevel.WARN:
          console.warn(`${color}${formattedMessage}${resetColor}`, ...args);
          break;
        case LogLevel.ERROR:
          console.error(`${color}${formattedMessage}${resetColor}`, ...args);
          break;
      }
    }
    
    // Call custom handlers
    for (const handler of this.handlers) {
      try {
        handler(level, formattedMessage, ...args);
      } catch (error) {
        console.error('Error in log handler:', error);
      }
    }
  }

  /**
   * Log a debug message
   */
  public debug(message: string, ...args: any[]): void {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Log an info message
   */
  public info(message: string, ...args: any[]): void {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, ...args: any[]): void {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Log an error message
   */
  public error(message: string, ...args: any[]): void {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * Create a child logger with a prefix
   */
  public createChild(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix,
    });
  }
}

// Create default logger instance with full implementation
export const logger = new Logger({
  prefix: 'JuliaOS',
});

// Export default instance
export default logger;

// Do not redeclare logger
// Removed duplicate declaration and export 