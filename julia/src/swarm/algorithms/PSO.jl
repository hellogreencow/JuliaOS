"""
PSO.jl - Particle Swarm Optimization Algorithm

Advanced implementation of Particle Swarm Optimization with adaptive parameters,
multiple neighborhood topologies, and convergence analysis for trading strategy optimization.
"""
module PSO

export ParticleSwarmOptimizer, optimize!, Particle, PSOConfig, PSOResult
export StandardPSO, AdaptivePSO, MultiSwarmPSO, QuantumPSO

using Random
using Statistics
using LinearAlgebra
using Dates

# PSO Configuration
mutable struct PSOConfig
    num_particles::Int
    max_iterations::Int
    w_max::Float64          # Maximum inertia weight
    w_min::Float64          # Minimum inertia weight
    c1::Float64             # Cognitive coefficient
    c2::Float64             # Social coefficient
    v_max::Float64          # Maximum velocity
    topology::Symbol        # :global, :local, :ring, :star
    neighborhood_size::Int
    convergence_threshold::Float64
    elite_size::Int
    mutation_rate::Float64
    
    function PSOConfig(;
        num_particles::Int = 50,
        max_iterations::Int = 1000,
        w_max::Float64 = 0.9,
        w_min::Float64 = 0.4,
        c1::Float64 = 2.0,
        c2::Float64 = 2.0,
        v_max::Float64 = 0.1,
        topology::Symbol = :global,
        neighborhood_size::Int = 5,
        convergence_threshold::Float64 = 1e-6,
        elite_size::Int = 5,
        mutation_rate::Float64 = 0.01
    )
        new(num_particles, max_iterations, w_max, w_min, c1, c2, v_max,
            topology, neighborhood_size, convergence_threshold, elite_size, mutation_rate)
    end
end

# Particle structure
mutable struct Particle
    position::Vector{Float64}
    velocity::Vector{Float64}
    personal_best_position::Vector{Float64}
    personal_best_fitness::Float64
    fitness::Float64
    neighbors::Vector{Int}
    
    function Particle(dimensions::Int)
        position = rand(dimensions) * 2.0 .- 1.0  # [-1, 1]
        velocity = (rand(dimensions) * 2.0 .- 1.0) * 0.1  # Small initial velocity
        new(position, velocity, copy(position), Inf, Inf, Int[])
    end
end

# PSO Result
struct PSOResult
    best_position::Vector{Float64}
    best_fitness::Float64
    fitness_history::Vector{Float64}
    convergence_iteration::Int
    total_iterations::Int
    computation_time::Float64
    convergence_achieved::Bool
    diversity_history::Vector{Float64}
    
    function PSOResult(best_pos, best_fit, fit_hist, conv_iter, total_iter, 
                      comp_time, converged, div_hist)
        new(best_pos, best_fit, fit_hist, conv_iter, total_iter, 
            comp_time, converged, div_hist)
    end
end

# Main PSO Optimizer
mutable struct ParticleSwarmOptimizer
    config::PSOConfig
    particles::Vector{Particle}
    global_best_position::Vector{Float64}
    global_best_fitness::Float64
    dimensions::Int
    iteration::Int
    fitness_history::Vector{Float64}
    diversity_history::Vector{Float64}
    stagnation_counter::Int
    
    function ParticleSwarmOptimizer(config::PSOConfig, dimensions::Int)
        particles = [Particle(dimensions) for _ in 1:config.num_particles]
        global_best_position = zeros(dimensions)
        global_best_fitness = Inf
        
        optimizer = new(config, particles, global_best_position, global_best_fitness,
                       dimensions, 0, Float64[], Float64[], 0)
        
        # Initialize neighborhoods
        initialize_neighborhoods!(optimizer)
        
        return optimizer
    end
end

"""
    optimize!(optimizer::ParticleSwarmOptimizer, objective_function::Function, 
              bounds::Vector{Tuple{Float64, Float64}})

Optimize using Particle Swarm Optimization algorithm.
"""
function optimize!(optimizer::ParticleSwarmOptimizer, objective_function::Function,
                  bounds::Vector{Tuple{Float64, Float64}})
    
    start_time = time()
    config = optimizer.config
    
    # Initialize particles within bounds
    initialize_particles!(optimizer, bounds)
    
    # Evaluate initial population
    evaluate_particles!(optimizer, objective_function)
    
    convergence_achieved = false
    
    for iteration in 1:config.max_iterations
        optimizer.iteration = iteration
        
        # Update inertia weight (linearly decreasing)
        w = config.w_max - (config.w_max - config.w_min) * iteration / config.max_iterations
        
        # Update velocities and positions
        update_particles!(optimizer, w, bounds)
        
        # Evaluate particles
        evaluate_particles!(optimizer, objective_function)
        
        # Update personal and global bests
        update_bests!(optimizer)
        
        # Record statistics
        push!(optimizer.fitness_history, optimizer.global_best_fitness)
        push!(optimizer.diversity_history, calculate_diversity(optimizer))
        
        # Check for convergence
        if check_convergence(optimizer)
            convergence_achieved = true
            break
        end
        
        # Apply adaptive mechanisms
        apply_adaptive_mechanisms!(optimizer, iteration)
    end
    
    computation_time = time() - start_time
    
    return PSOResult(
        copy(optimizer.global_best_position),
        optimizer.global_best_fitness,
        copy(optimizer.fitness_history),
        convergence_achieved ? optimizer.iteration : -1,
        optimizer.iteration,
        computation_time,
        convergence_achieved,
        copy(optimizer.diversity_history)
    )
end

"""
Initialize particles within specified bounds
"""
function initialize_particles!(optimizer::ParticleSwarmOptimizer, 
                              bounds::Vector{Tuple{Float64, Float64}})
    for particle in optimizer.particles
        for (i, (lower, upper)) in enumerate(bounds)
            particle.position[i] = lower + rand() * (upper - lower)
            particle.velocity[i] = (rand() - 0.5) * optimizer.config.v_max
        end
        particle.personal_best_position = copy(particle.position)
    end
end

"""
Initialize neighborhood topologies
"""
function initialize_neighborhoods!(optimizer::ParticleSwarmOptimizer)
    config = optimizer.config
    n_particles = length(optimizer.particles)
    
    if config.topology == :global
        # Each particle connected to all others
        for particle in optimizer.particles
            particle.neighbors = collect(1:n_particles)
        end
        
    elseif config.topology == :local
        # Ring topology with local neighborhoods
        for i in 1:n_particles
            neighbors = Int[]
            for j in (-config.neighborhood_size÷2):(config.neighborhood_size÷2)
                neighbor_idx = mod1(i + j, n_particles)
                if neighbor_idx != i
                    push!(neighbors, neighbor_idx)
                end
            end
            optimizer.particles[i].neighbors = neighbors
        end
        
    elseif config.topology == :ring
        # Simple ring topology
        for i in 1:n_particles
            prev = mod1(i - 1, n_particles)
            next = mod1(i + 1, n_particles)
            optimizer.particles[i].neighbors = [prev, next]
        end
        
    elseif config.topology == :star
        # Star topology with central hub
        hub = 1
        for i in 1:n_particles
            if i == hub
                optimizer.particles[i].neighbors = collect(1:n_particles)
            else
                optimizer.particles[i].neighbors = [hub]
            end
        end
    end
end

"""
Evaluate all particles using the objective function
"""
function evaluate_particles!(optimizer::ParticleSwarmOptimizer, objective_function::Function)
    for particle in optimizer.particles
        try
            particle.fitness = objective_function(particle.position)
        catch e
            particle.fitness = Inf  # Penalty for invalid solutions
        end
    end
end

"""
Update particle velocities and positions
"""
function update_particles!(optimizer::ParticleSwarmOptimizer, w::Float64,
                          bounds::Vector{Tuple{Float64, Float64}})
    config = optimizer.config
    
    for (i, particle) in enumerate(optimizer.particles)
        # Find neighborhood best
        neighborhood_best_pos = find_neighborhood_best(optimizer, i)
        
        # Update velocity
        r1 = rand(optimizer.dimensions)
        r2 = rand(optimizer.dimensions)
        
        cognitive_component = config.c1 * r1 .* (particle.personal_best_position - particle.position)
        social_component = config.c2 * r2 .* (neighborhood_best_pos - particle.position)
        
        particle.velocity = w * particle.velocity + cognitive_component + social_component
        
        # Apply velocity constraints
        clamp_velocity!(particle, config.v_max)
        
        # Update position
        particle.position += particle.velocity
        
        # Apply position bounds
        apply_bounds!(particle, bounds)
    end
end

"""
Find the best position in particle's neighborhood
"""
function find_neighborhood_best(optimizer::ParticleSwarmOptimizer, particle_idx::Int)
    particle = optimizer.particles[particle_idx]
    
    if optimizer.config.topology == :global
        return optimizer.global_best_position
    end
    
    best_fitness = Inf
    best_position = particle.personal_best_position
    
    for neighbor_idx in particle.neighbors
        neighbor = optimizer.particles[neighbor_idx]
        if neighbor.personal_best_fitness < best_fitness
            best_fitness = neighbor.personal_best_fitness
            best_position = neighbor.personal_best_position
        end
    end
    
    return best_position
end

"""
Clamp velocity to maximum values
"""
function clamp_velocity!(particle::Particle, v_max::Float64)
    for i in 1:length(particle.velocity)
        particle.velocity[i] = clamp(particle.velocity[i], -v_max, v_max)
    end
end

"""
Apply position bounds with reflection
"""
function apply_bounds!(particle::Particle, bounds::Vector{Tuple{Float64, Float64}})
    for (i, (lower, upper)) in enumerate(bounds)
        if particle.position[i] < lower
            particle.position[i] = lower + (lower - particle.position[i])
            particle.velocity[i] *= -0.5  # Reflection with damping
        elseif particle.position[i] > upper
            particle.position[i] = upper - (particle.position[i] - upper)
            particle.velocity[i] *= -0.5  # Reflection with damping
        end
    end
end

"""
Update personal and global best positions
"""
function update_bests!(optimizer::ParticleSwarmOptimizer)
    for particle in optimizer.particles
        # Update personal best
        if particle.fitness < particle.personal_best_fitness
            particle.personal_best_fitness = particle.fitness
            particle.personal_best_position = copy(particle.position)
        end
        
        # Update global best
        if particle.fitness < optimizer.global_best_fitness
            optimizer.global_best_fitness = particle.fitness
            optimizer.global_best_position = copy(particle.position)
            optimizer.stagnation_counter = 0
        end
    end
end

"""
Calculate swarm diversity
"""
function calculate_diversity(optimizer::ParticleSwarmOptimizer)
    positions = [p.position for p in optimizer.particles]
    center = mean(positions)
    
    diversity = 0.0
    for position in positions
        diversity += norm(position - center)
    end
    
    return diversity / length(positions)
end

"""
Check for convergence
"""
function check_convergence(optimizer::ParticleSwarmOptimizer)
    config = optimizer.config
    
    # Check if diversity is below threshold
    if length(optimizer.diversity_history) > 10
        recent_diversity = mean(optimizer.diversity_history[end-9:end])
        if recent_diversity < config.convergence_threshold
            return true
        end
    end
    
    # Check fitness improvement stagnation
    if length(optimizer.fitness_history) > 50
        recent_improvement = optimizer.fitness_history[end-49] - optimizer.fitness_history[end]
        if recent_improvement < config.convergence_threshold
            optimizer.stagnation_counter += 1
            if optimizer.stagnation_counter > 20
                return true
            end
        else
            optimizer.stagnation_counter = 0
        end
    end
    
    return false
end

"""
Apply adaptive mechanisms during optimization
"""
function apply_adaptive_mechanisms!(optimizer::ParticleSwarmOptimizer, iteration::Int)
    config = optimizer.config
    
    # Mutation for diversity maintenance
    if rand() < config.mutation_rate
        worst_particles = sortperm([p.fitness for p in optimizer.particles], rev=true)[1:config.elite_size]
        
        for idx in worst_particles
            particle = optimizer.particles[idx]
            mutation_strength = 0.1 * (1.0 - iteration / config.max_iterations)
            
            for i in 1:length(particle.position)
                if rand() < 0.1  # 10% mutation probability per dimension
                    particle.position[i] += randn() * mutation_strength
                end
            end
        end
    end
    
    # Restart mechanism for premature convergence
    if optimizer.stagnation_counter > 30
        n_restart = config.num_particles ÷ 4
        worst_indices = sortperm([p.fitness for p in optimizer.particles], rev=true)[1:n_restart]
        
        for idx in worst_indices
            particle = optimizer.particles[idx]
            particle.position = rand(optimizer.dimensions) * 2.0 .- 1.0
            particle.velocity = (rand(optimizer.dimensions) * 2.0 .- 1.0) * 0.1
            particle.fitness = Inf
        end
        
        optimizer.stagnation_counter = 0
    end
end

# Specialized PSO variants

"""
Standard PSO implementation
"""
function StandardPSO(dimensions::Int; kwargs...)
    config = PSOConfig(; kwargs...)
    return ParticleSwarmOptimizer(config, dimensions)
end

"""
Adaptive PSO with dynamic parameter adjustment
"""
function AdaptivePSO(dimensions::Int; kwargs...)
    config = PSOConfig(; 
        w_max = 0.9, w_min = 0.1,
        c1 = 2.5, c2 = 0.5,
        topology = :local,
        kwargs...)
    return ParticleSwarmOptimizer(config, dimensions)
end

"""
Multi-swarm PSO for complex optimization landscapes
"""
function MultiSwarmPSO(dimensions::Int, num_swarms::Int = 3; kwargs...)
    # Create multiple smaller swarms
    swarm_size = max(10, 50 ÷ num_swarms)
    config = PSOConfig(; 
        num_particles = swarm_size,
        topology = :ring,
        kwargs...)
    
    swarms = [ParticleSwarmOptimizer(config, dimensions) for _ in 1:num_swarms]
    return swarms
end

"""
Quantum-inspired PSO with quantum behavior
"""
function QuantumPSO(dimensions::Int; kwargs...)
    config = PSOConfig(;
        num_particles = 40,
        w_max = 0.5, w_min = 0.1,
        c1 = 1.5, c2 = 1.5,
        mutation_rate = 0.05,
        kwargs...)
    return ParticleSwarmOptimizer(config, dimensions)
end

# Utility functions for trading strategy optimization

"""
Create bounds for trading strategy parameters
"""
function create_trading_bounds(strategy_type::Symbol)
    if strategy_type == :mean_reversion
        return [
            (0.1, 0.9),    # mean_reversion_factor
            (10, 100),     # lookback_period
            (0.01, 0.1),   # entry_threshold
            (0.005, 0.05), # exit_threshold
            (0.01, 0.2)    # position_size
        ]
    elseif strategy_type == :momentum
        return [
            (5, 50),       # short_ma_period
            (20, 200),     # long_ma_period
            (0.01, 0.1),   # momentum_threshold
            (0.01, 0.2)    # position_size
        ]
    elseif strategy_type == :arbitrage
        return [
            (0.001, 0.01), # min_spread
            (0.1, 5.0),    # max_exposure
            (1, 60),       # max_hold_time
            (0.0001, 0.01) # slippage_tolerance
        ]
    else
        error("Unknown strategy type: $strategy_type")
    end
end

"""
Optimize trading strategy using PSO
"""
function optimize_trading_strategy(strategy_type::Symbol, backtest_function::Function;
                                 pso_config::PSOConfig = PSOConfig())
    
    bounds = create_trading_bounds(strategy_type)
    dimensions = length(bounds)
    
    optimizer = ParticleSwarmOptimizer(pso_config, dimensions)
    
    # Objective function wrapper for trading strategies
    function trading_objective(params)
        try
            result = backtest_function(params)
            # Minimize negative Sharpe ratio (maximize Sharpe ratio)
            return -result["sharpe_ratio"]
        catch e
            return 1000.0  # High penalty for invalid parameters
        end
    end
    
    return optimize!(optimizer, trading_objective, bounds)
end

end # module