import winston from 'winston';

// Custom log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Define colors for each level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'grey',
  debug: 'white',
  silly: 'rainbow'
};

// Add colors to winston
winston.addColors(logColors);

// Create custom format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Create winston logger
class Logger {
  private winston: winston.Logger;

  constructor(options: winston.LoggerOptions = {}) {
    this.winston = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      levels: logLevels,
      format: logFormat,
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }),
        ...(process.env.NODE_ENV === 'production' ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            format: winston.format.json()
          }),
          new winston.transports.File({
            filename: 'logs/combined.log',
            format: winston.format.json()
          })
        ] : [])
      ],
      ...options
    });
  }

  info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }

  error(message: string, meta?: any): void {
    this.winston.error(message, meta);
  }

  warn(message: string, meta?: any): void {
    this.winston.warn(message, meta);
  }

  debug(message: string, meta?: any): void {
    this.winston.debug(message, meta);
  }

  verbose(message: string, meta?: any): void {
    this.winston.verbose(message, meta);
  }

  http(message: string, meta?: any): void {
    this.winston.http(message, meta);
  }

  silly(message: string, meta?: any): void {
    this.winston.silly(message, meta);
  }
}

// Export single logger instance
const logger = new Logger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat
});

export default logger;
export { logger }; 