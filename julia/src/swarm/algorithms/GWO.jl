"""
GWO.jl - Grey Wolf Optimizer Algorithm

Advanced implementation of Grey Wolf Optimizer with adaptive mechanisms,
dynamic hierarchy updates, and enhanced exploration-exploitation balance
for complex trading strategy optimization problems.
"""
module GWO

export GreyWolfOptimizer, optimize!, Wolf, GWOConfig, GWOResult
export StandardGWO, AdaptiveGWO, HybridGWO

using Random
using Statistics
using LinearAlgebra
using Dates

# GWO Configuration
mutable struct GWOConfig
    pack_size::Int
    max_iterations::Int
    a_decay_rate::Float64        # Controls exploration vs exploitation
    min_a::Float64               # Minimum value of a parameter
    convergence_threshold::Float64
    elite_size::Int
    mutation_rate::Float64
    adaptive_a::Bool             # Whether to use adaptive a parameter
    position_update_strategy::Symbol  # :standard, :adaptive, :hybrid
    boundary_handling::Symbol   # :reflect, :absorb, :wrap
    
    function GWOConfig(;
        pack_size::Int = 30,
        max_iterations::Int = 500,
        a_decay_rate::Float64 = 2.0,
        min_a::Float64 = 0.0,
        convergence_threshold::Float64 = 1e-6,
        elite_size::Int = 3,
        mutation_rate::Float64 = 0.02,
        adaptive_a::Bool = true,
        position_update_strategy::Symbol = :adaptive,
        boundary_handling::Symbol = :reflect
    )
        new(pack_size, max_iterations, a_decay_rate, min_a, convergence_threshold,
            elite_size, mutation_rate, adaptive_a, position_update_strategy, boundary_handling)
    end
end

# Wolf structure representing solution
mutable struct Wolf
    position::Vector{Float64}
    fitness::Float64
    velocity::Vector{Float64}  # For hybrid approaches
    
    function Wolf(dimensions::Int)
        position = rand(dimensions) * 2.0 .- 1.0
        velocity = zeros(dimensions)
        new(position, Inf, velocity)
    end
end

# GWO Result
struct GWOResult
    best_position::Vector{Float64}
    best_fitness::Float64
    fitness_history::Vector{Float64}
    alpha_history::Vector{Vector{Float64}}  # Track alpha wolf positions
    convergence_iteration::Int
    total_iterations::Int
    computation_time::Float64
    convergence_achieved::Bool
    diversity_history::Vector{Float64}
    
    function GWOResult(best_pos, best_fit, fit_hist, alpha_hist, conv_iter, 
                      total_iter, comp_time, converged, div_hist)
        new(best_pos, best_fit, fit_hist, alpha_hist, conv_iter, total_iter,
            comp_time, converged, div_hist)
    end
end

# Main GWO Optimizer
mutable struct GreyWolfOptimizer
    config::GWOConfig
    pack::Vector{Wolf}
    alpha::Wolf     # Best wolf (leader)
    beta::Wolf      # Second best wolf
    delta::Wolf     # Third best wolf
    dimensions::Int
    iteration::Int
    fitness_history::Vector{Float64}
    alpha_history::Vector{Vector{Float64}}
    diversity_history::Vector{Float64}
    a_parameter::Float64
    stagnation_counter::Int
    
    function GreyWolfOptimizer(config::GWOConfig, dimensions::Int)
        pack = [Wolf(dimensions) for _ in 1:config.pack_size]
        alpha = Wolf(dimensions)
        beta = Wolf(dimensions)
        delta = Wolf(dimensions)
        
        new(config, pack, alpha, beta, delta, dimensions, 0,
            Float64[], Vector{Vector{Float64}}(), Float64[], 
            config.a_decay_rate, 0)
    end
end

"""
    optimize!(optimizer::GreyWolfOptimizer, objective_function::Function,
              bounds::Vector{Tuple{Float64, Float64}})

Optimize using Grey Wolf Optimizer algorithm.
"""
function optimize!(optimizer::GreyWolfOptimizer, objective_function::Function,
                  bounds::Vector{Tuple{Float64, Float64}})
    
    start_time = time()
    config = optimizer.config
    
    # Initialize pack within bounds
    initialize_pack!(optimizer, bounds)
    
    # Evaluate initial pack
    evaluate_pack!(optimizer, objective_function)
    
    # Sort and assign hierarchy
    update_hierarchy!(optimizer)
    
    convergence_achieved = false
    
    for iteration in 1:config.max_iterations
        optimizer.iteration = iteration
        
        # Update a parameter
        update_a_parameter!(optimizer)
        
        # Update positions of wolves
        update_pack_positions!(optimizer, bounds)
        
        # Evaluate pack
        evaluate_pack!(optimizer, objective_function)
        
        # Update hierarchy
        update_hierarchy!(optimizer)
        
        # Record statistics
        push!(optimizer.fitness_history, optimizer.alpha.fitness)
        push!(optimizer.alpha_history, copy(optimizer.alpha.position))
        push!(optimizer.diversity_history, calculate_pack_diversity(optimizer))
        
        # Check convergence
        if check_convergence(optimizer)
            convergence_achieved = true
            break
        end
        
        # Apply adaptive mechanisms
        apply_adaptive_mechanisms!(optimizer, iteration)
    end
    
    computation_time = time() - start_time
    
    return GWOResult(
        copy(optimizer.alpha.position),
        optimizer.alpha.fitness,
        copy(optimizer.fitness_history),
        copy(optimizer.alpha_history),
        convergence_achieved ? optimizer.iteration : -1,
        optimizer.iteration,
        computation_time,
        convergence_achieved,
        copy(optimizer.diversity_history)
    )
end

"""
Initialize pack within specified bounds
"""
function initialize_pack!(optimizer::GreyWolfOptimizer, 
                         bounds::Vector{Tuple{Float64, Float64}})
    for wolf in optimizer.pack
        for (i, (lower, upper)) in enumerate(bounds)
            wolf.position[i] = lower + rand() * (upper - lower)
        end
    end
end

"""
Evaluate all wolves using objective function
"""
function evaluate_pack!(optimizer::GreyWolfOptimizer, objective_function::Function)
    for wolf in optimizer.pack
        try
            wolf.fitness = objective_function(wolf.position)
        catch e
            wolf.fitness = Inf  # Penalty for invalid solutions
        end
    end
end

"""
Update pack hierarchy (alpha, beta, delta)
"""
function update_hierarchy!(optimizer::GreyWolfOptimizer)
    # Sort wolves by fitness
    sorted_indices = sortperm([wolf.fitness for wolf in optimizer.pack])
    
    if length(sorted_indices) >= 1
        best_wolf = optimizer.pack[sorted_indices[1]]
        if best_wolf.fitness < optimizer.alpha.fitness
            optimizer.alpha.position = copy(best_wolf.position)
            optimizer.alpha.fitness = best_wolf.fitness
            optimizer.stagnation_counter = 0
        else
            optimizer.stagnation_counter += 1
        end
    end
    
    if length(sorted_indices) >= 2
        second_best = optimizer.pack[sorted_indices[2]]
        if second_best.fitness < optimizer.beta.fitness
            optimizer.beta.position = copy(second_best.position)
            optimizer.beta.fitness = second_best.fitness
        end
    end
    
    if length(sorted_indices) >= 3
        third_best = optimizer.pack[sorted_indices[3]]
        if third_best.fitness < optimizer.delta.fitness
            optimizer.delta.position = copy(third_best.position)
            optimizer.delta.fitness = third_best.fitness
        end
    end
end

"""
Update a parameter for exploration/exploitation balance
"""
function update_a_parameter!(optimizer::GreyWolfOptimizer)
    config = optimizer.config
    
    if config.adaptive_a
        # Adaptive a based on diversity and convergence
        diversity = length(optimizer.diversity_history) > 0 ? 
                   optimizer.diversity_history[end] : 1.0
        
        # Higher diversity -> more exploration (higher a)
        # Lower diversity -> more exploitation (lower a)
        base_a = config.a_decay_rate * (1 - optimizer.iteration / config.max_iterations)
        diversity_factor = min(diversity, 1.0)
        optimizer.a_parameter = max(config.min_a, base_a * (0.5 + 0.5 * diversity_factor))
    else
        # Linear decay
        optimizer.a_parameter = config.a_decay_rate * (1 - optimizer.iteration / config.max_iterations)
        optimizer.a_parameter = max(config.min_a, optimizer.a_parameter)
    end
end

"""
Update positions of all wolves in the pack
"""
function update_pack_positions!(optimizer::GreyWolfOptimizer, 
                               bounds::Vector{Tuple{Float64, Float64}})
    
    for (i, wolf) in enumerate(optimizer.pack)
        if optimizer.config.position_update_strategy == :standard
            update_wolf_position_standard!(optimizer, wolf, bounds)
        elseif optimizer.config.position_update_strategy == :adaptive
            update_wolf_position_adaptive!(optimizer, wolf, bounds, i)
        elseif optimizer.config.position_update_strategy == :hybrid
            update_wolf_position_hybrid!(optimizer, wolf, bounds, i)
        end
    end
end

"""
Standard GWO position update
"""
function update_wolf_position_standard!(optimizer::GreyWolfOptimizer, wolf::Wolf,
                                       bounds::Vector{Tuple{Float64, Float64}})
    a = optimizer.a_parameter
    
    # Calculate positions influenced by alpha, beta, delta
    X1 = calculate_position_influence(optimizer.alpha.position, wolf.position, a)
    X2 = calculate_position_influence(optimizer.beta.position, wolf.position, a)
    X3 = calculate_position_influence(optimizer.delta.position, wolf.position, a)
    
    # Average the influences
    new_position = (X1 + X2 + X3) / 3.0
    
    # Apply bounds
    apply_boundary_constraints!(new_position, bounds, optimizer.config.boundary_handling)
    
    wolf.position = new_position
end

"""
Adaptive GWO position update with dynamic weights
"""
function update_wolf_position_adaptive!(optimizer::GreyWolfOptimizer, wolf::Wolf,
                                       bounds::Vector{Tuple{Float64, Float64}}, wolf_index::Int)
    a = optimizer.a_parameter
    
    # Calculate adaptive weights based on fitness differences
    alpha_weight = calculate_adaptive_weight(optimizer.alpha.fitness, wolf.fitness)
    beta_weight = calculate_adaptive_weight(optimizer.beta.fitness, wolf.fitness)
    delta_weight = calculate_adaptive_weight(optimizer.delta.fitness, wolf.fitness)
    
    # Normalize weights
    total_weight = alpha_weight + beta_weight + delta_weight
    if total_weight > 0
        alpha_weight /= total_weight
        beta_weight /= total_weight
        delta_weight /= total_weight
    else
        alpha_weight = beta_weight = delta_weight = 1.0/3.0
    end
    
    # Calculate weighted position influences
    X1 = calculate_position_influence(optimizer.alpha.position, wolf.position, a)
    X2 = calculate_position_influence(optimizer.beta.position, wolf.position, a)
    X3 = calculate_position_influence(optimizer.delta.position, wolf.position, a)
    
    # Weighted average
    new_position = alpha_weight * X1 + beta_weight * X2 + delta_weight * X3
    
    # Add exploration component for diversity
    if rand() < 0.1  # 10% chance for random exploration
        exploration_strength = a * 0.1
        for i in 1:length(new_position)
            new_position[i] += randn() * exploration_strength
        end
    end
    
    # Apply bounds
    apply_boundary_constraints!(new_position, bounds, optimizer.config.boundary_handling)
    
    wolf.position = new_position
end

"""
Hybrid GWO with velocity component (PSO-inspired)
"""
function update_wolf_position_hybrid!(optimizer::GreyWolfOptimizer, wolf::Wolf,
                                     bounds::Vector{Tuple{Float64, Float64}}, wolf_index::Int)
    a = optimizer.a_parameter
    
    # GWO component
    X1 = calculate_position_influence(optimizer.alpha.position, wolf.position, a)
    X2 = calculate_position_influence(optimizer.beta.position, wolf.position, a)
    X3 = calculate_position_influence(optimizer.delta.position, wolf.position, a)
    gwo_position = (X1 + X2 + X3) / 3.0
    
    # PSO-inspired velocity update
    w = 0.5 * (1 - optimizer.iteration / optimizer.config.max_iterations)  # Inertia weight
    c1, c2 = 1.5, 1.5  # Acceleration coefficients
    
    # Find personal best (closest to alpha)
    personal_best = find_personal_best(wolf, optimizer.alpha.position)
    
    # Update velocity
    r1, r2 = rand(optimizer.dimensions), rand(optimizer.dimensions)
    cognitive = c1 * r1 .* (personal_best - wolf.position)
    social = c2 * r2 .* (optimizer.alpha.position - wolf.position)
    
    wolf.velocity = w * wolf.velocity + cognitive + social
    
    # Limit velocity
    v_max = 0.1 * (maximum([upper - lower for (lower, upper) in bounds]))
    wolf.velocity = clamp.(wolf.velocity, -v_max, v_max)
    
    # Combine GWO and PSO components
    hybrid_weight = 0.7  # Weight for GWO component
    new_position = hybrid_weight * gwo_position + (1 - hybrid_weight) * (wolf.position + wolf.velocity)
    
    # Apply bounds
    apply_boundary_constraints!(new_position, bounds, optimizer.config.boundary_handling)
    
    wolf.position = new_position
end

"""
Calculate position influence from leader wolf
"""
function calculate_position_influence(leader_position::Vector{Float64}, 
                                    wolf_position::Vector{Float64}, a::Float64)
    
    r1 = rand(length(leader_position))
    r2 = rand(length(leader_position))
    
    A = 2.0 * a .* r1 .- a  # Coefficient A
    C = 2.0 .* r2           # Coefficient C
    
    D = abs.(C .* leader_position - wolf_position)
    X = leader_position - A .* D
    
    return X
end

"""
Calculate adaptive weight based on fitness difference
"""
function calculate_adaptive_weight(leader_fitness::Float64, wolf_fitness::Float64)
    if wolf_fitness == Inf || leader_fitness == Inf
        return 1.0
    end
    
    if wolf_fitness <= leader_fitness
        return 2.0  # Higher weight for better wolves
    else
        fitness_ratio = leader_fitness / wolf_fitness
        return max(0.1, fitness_ratio)  # Lower weight for worse wolves
    end
end

"""
Find personal best position for hybrid approach
"""
function find_personal_best(wolf::Wolf, alpha_position::Vector{Float64})
    # For simplicity, use current position or move towards alpha
    if wolf.fitness == Inf
        return alpha_position
    else
        return wolf.position
    end
end

"""
Apply boundary constraints based on strategy
"""
function apply_boundary_constraints!(position::Vector{Float64}, 
                                   bounds::Vector{Tuple{Float64, Float64}},
                                   strategy::Symbol)
    for (i, (lower, upper)) in enumerate(bounds)
        if strategy == :reflect
            # Reflection at boundaries
            if position[i] < lower
                position[i] = lower + (lower - position[i])
            elseif position[i] > upper
                position[i] = upper - (position[i] - upper)
            end
        elseif strategy == :absorb
            # Absorb at boundaries
            position[i] = clamp(position[i], lower, upper)
        elseif strategy == :wrap
            # Wrap around boundaries
            range = upper - lower
            if position[i] < lower
                position[i] = upper - (lower - position[i]) % range
            elseif position[i] > upper
                position[i] = lower + (position[i] - upper) % range
            end
        end
    end
end

"""
Calculate pack diversity
"""
function calculate_pack_diversity(optimizer::GreyWolfOptimizer)
    positions = [wolf.position for wolf in optimizer.pack]
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
function check_convergence(optimizer::GreyWolfOptimizer)
    config = optimizer.config
    
    # Check diversity convergence
    if length(optimizer.diversity_history) > 10
        recent_diversity = mean(optimizer.diversity_history[end-9:end])
        if recent_diversity < config.convergence_threshold
            return true
        end
    end
    
    # Check fitness stagnation
    if optimizer.stagnation_counter > 50
        return true
    end
    
    # Check fitness improvement
    if length(optimizer.fitness_history) > 30
        recent_improvement = optimizer.fitness_history[end-29] - optimizer.fitness_history[end]
        if recent_improvement < config.convergence_threshold
            return true
        end
    end
    
    return false
end

"""
Apply adaptive mechanisms during optimization
"""
function apply_adaptive_mechanisms!(optimizer::GreyWolfOptimizer, iteration::Int)
    config = optimizer.config
    
    # Mutation for diversity maintenance
    if rand() < config.mutation_rate
        n_mutate = max(1, config.pack_size ÷ 10)
        worst_indices = sortperm([wolf.fitness for wolf in optimizer.pack], rev=true)[1:n_mutate]
        
        for idx in worst_indices
            wolf = optimizer.pack[idx]
            mutation_strength = 0.1 * (1.0 - iteration / config.max_iterations)
            
            for i in 1:length(wolf.position)
                if rand() < 0.2  # 20% mutation probability per dimension
                    wolf.position[i] += randn() * mutation_strength
                end
            end
        end
    end
    
    # Elite preservation and restart
    if optimizer.stagnation_counter > 25
        # Keep elite wolves, restart others
        n_elite = config.elite_size
        sorted_indices = sortperm([wolf.fitness for wolf in optimizer.pack])
        
        for i in (n_elite+1):length(optimizer.pack)
            wolf = optimizer.pack[sorted_indices[i]]
            wolf.position = rand(optimizer.dimensions) * 2.0 .- 1.0
            wolf.fitness = Inf
            wolf.velocity = zeros(optimizer.dimensions)
        end
        
        optimizer.stagnation_counter = 0
    end
end

# Specialized GWO variants

"""
Standard GWO implementation
"""
function StandardGWO(dimensions::Int; kwargs...)
    config = GWOConfig(; 
        position_update_strategy = :standard,
        adaptive_a = false,
        kwargs...)
    return GreyWolfOptimizer(config, dimensions)
end

"""
Adaptive GWO with enhanced mechanisms
"""
function AdaptiveGWO(dimensions::Int; kwargs...)
    config = GWOConfig(;
        position_update_strategy = :adaptive,
        adaptive_a = true,
        mutation_rate = 0.05,
        kwargs...)
    return GreyWolfOptimizer(config, dimensions)
end

"""
Hybrid GWO combining with PSO elements
"""
function HybridGWO(dimensions::Int; kwargs...)
    config = GWOConfig(;
        position_update_strategy = :hybrid,
        adaptive_a = true,
        pack_size = 40,
        mutation_rate = 0.03,
        kwargs...)
    return GreyWolfOptimizer(config, dimensions)
end

# Trading-specific utilities

"""
Optimize trading strategy using GWO
"""
function optimize_trading_strategy_gwo(strategy_type::Symbol, backtest_function::Function;
                                      gwo_config::GWOConfig = GWOConfig())
    
    # Define trading strategy bounds
    bounds = if strategy_type == :mean_reversion
        [
            (0.05, 0.95),   # mean_reversion_factor
            (5, 200),       # lookback_period  
            (0.005, 0.2),   # entry_threshold
            (0.001, 0.1),   # exit_threshold
            (0.01, 0.5),    # position_size
            (0.001, 0.05)   # stop_loss
        ]
    elseif strategy_type == :momentum
        [
            (3, 100),       # short_period
            (10, 300),      # long_period
            (0.01, 0.3),    # momentum_threshold
            (0.01, 0.3),    # position_size
            (0.001, 0.1)    # stop_loss
        ]
    elseif strategy_type == :pairs_trading
        [
            (10, 252),      # lookback_period
            (1.0, 3.0),     # entry_zscore
            (0.0, 1.0),     # exit_zscore
            (0.01, 0.2),    # position_size
            (1, 20)         # max_holding_period
        ]
    else
        error("Unknown strategy type: $strategy_type")
    end
    
    dimensions = length(bounds)
    optimizer = GreyWolfOptimizer(gwo_config, dimensions)
    
    # Objective function for trading optimization
    function trading_objective(params)
        try
            result = backtest_function(params)
            
            # Multi-objective optimization with weighted factors
            sharpe_ratio = get(result, "sharpe_ratio", -10.0)
            max_drawdown = get(result, "max_drawdown", 1.0)
            total_return = get(result, "total_return", -1.0)
            win_rate = get(result, "win_rate", 0.0)
            
            # Composite fitness (minimize negative performance)
            fitness = -(0.4 * sharpe_ratio + 
                       0.3 * total_return - 
                       0.2 * max_drawdown + 
                       0.1 * win_rate)
            
            return fitness
        catch e
            return 1000.0  # High penalty for invalid parameters
        end
    end
    
    return optimize!(optimizer, trading_objective, bounds)
end

end # module