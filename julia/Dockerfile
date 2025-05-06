FROM julia:1.10

WORKDIR /app

# Copy project definition files first for better layer caching
COPY julia/Project.toml julia/Manifest.toml /app/

# Activate environment and install dependencies
RUN julia -e 'using Pkg; Pkg.activate("."); Pkg.instantiate()'

# Copy necessary source code
# Avoid copying the entire project to keep image small
COPY julia/src /app/src
COPY julia/julia_server.jl /app/
COPY julia/load_modules.jl /app/ 
# Assuming this is needed by julia_server.jl
# If Bridge.jl needs specific setup beyond Pkg, copy it, otherwise rely on Pkg
# COPY julia/bridge /app/bridge # If needed

# If setup.jl is truly necessary and idempotent
# COPY julia/setup.jl /app/
# RUN julia setup.jl

# Precompile packages for faster startup (optional, remove if causing issues)
# RUN julia --project=. -e 'using Pkg; Pkg.precompile()'

# Expose the server port
EXPOSE 8052

# Health check (adjust path if needed)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
#  CMD curl -f http://localhost:8052/health || exit 1

# Correct entrypoint to run the server
CMD ["julia", "--project=.", "julia_server.jl"] 