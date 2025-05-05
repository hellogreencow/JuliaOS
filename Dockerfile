FROM node:18-slim

# Install Julia dependencies
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    ca-certificates \
    git \
    build-essential \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Julia
RUN wget -q https://julialang-s3.julialang.org/bin/linux/x64/1.11/julia-1.11.4-linux-x86_64.tar.gz \
    && tar -xzf julia-1.11.4-linux-x86_64.tar.gz \
    && mv julia-1.11.4 /opt/julia \
    && ln -s /opt/julia/bin/julia /usr/local/bin/julia \
    && rm julia-1.11.4-linux-x86_64.tar.gz

# Set working directory
WORKDIR /app

# Copy package.json and install Node.js dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy Julia project files
COPY julia/Project.toml julia/Manifest.toml ./julia/

# Install Julia dependencies
RUN cd julia && julia -e 'using Pkg; Pkg.activate("."); Pkg.instantiate()'

# Copy the rest of the application
COPY . .

# Precompile Julia packages
RUN cd julia && julia -e 'using Pkg; Pkg.activate("."); Pkg.precompile()'

# Expose the server port
EXPOSE 8052

# Set environment variables
ENV NODE_ENV=production
ENV JULIA_SERVER_HOST=localhost
ENV JULIA_SERVER_PORT=8052

# Copy entrypoint script
COPY scripts/docker-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set the entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Default command
CMD ["cli"]
