"""
ACO.jl - Ant Colony Optimization Algorithm

Advanced implementation of Ant Colony Optimization with multiple variants,
dynamic pheromone management, and specialized features for trading path
optimization, portfolio construction, and strategy selection.
"""
module ACO

export AntColonyOptimizer, optimize!, Ant, ACOConfig, ACOResult
export StandardACO, MaxMinACO, ElitistACO, RankedACO

using Random
using Statistics
using LinearAlgebra
using Dates

# ACO Configuration
mutable struct ACOConfig
    num_ants::Int
    max_iterations::Int
    alpha::Float64              # Pheromone importance
    beta::Float64               # Heuristic importance  
    rho::Float64                # Pheromone evaporation rate
    q0::Float64                 # Exploitation vs exploration
    tau_min::Float64            # Minimum pheromone level
    tau_max::Float64            # Maximum pheromone level
    elite_ants::Int             # Number of elite ants
    local_search::Bool          # Enable local search
    convergence_threshold::Float64
    pheromone_init::Float64     # Initial pheromone level
    heuristic_power::Float64    # Power of heuristic information
    
    function ACOConfig(;
        num_ants::Int = 20,
        max_iterations::Int = 100,
        alpha::Float64 = 1.0,
        beta::Float64 = 2.0,
        rho::Float64 = 0.1,
        q0::Float64 = 0.9,
        tau_min::Float64 = 0.01,
        tau_max::Float64 = 10.0,
        elite_ants::Int = 3,
        local_search::Bool = true,
        convergence_threshold::Float64 = 1e-6,
        pheromone_init::Float64 = 1.0,
        heuristic_power::Float64 = 1.0
    )
        new(num_ants, max_iterations, alpha, beta, rho, q0, tau_min, tau_max,
            elite_ants, local_search, convergence_threshold, pheromone_init, heuristic_power)
    end
end

# Ant structure
mutable struct Ant
    path::Vector{Int}           # Solution path/permutation
    visited::Set{Int}           # Visited nodes
    current_node::Int           # Current position
    path_cost::Float64          # Cost of current path
    solution::Vector{Float64}   # Continuous solution vector
    fitness::Float64            # Solution fitness
    
    function Ant(problem_size::Int)
        new(Int[], Set{Int}(), 1, 0.0, Float64[], Inf)
    end
end

# ACO Result
struct ACOResult
    best_solution::Vector{Float64}
    best_path::Vector{Int}
    best_fitness::Float64
    fitness_history::Vector{Float64}
    convergence_iteration::Int
    total_iterations::Int
    computation_time::Float64
    convergence_achieved::Bool
    diversity_history::Vector{Float64}
    pheromone_matrix::Matrix{Float64}
    
    function ACOResult(best_sol, best_path, best_fit, fit_hist, conv_iter,
                      total_iter, comp_time, converged, div_hist, pheromones)
        new(best_sol, best_path, best_fit, fit_hist, conv_iter, total_iter,
            comp_time, converged, div_hist, pheromones)
    end
end

# Main ACO Optimizer
mutable struct AntColonyOptimizer
    config::ACOConfig
    colony::Vector{Ant}
    pheromone_matrix::Matrix{Float64}
    heuristic_matrix::Matrix{Float64}
    problem_size::Int
    best_ant::Ant
    iteration::Int
    fitness_history::Vector{Float64}
    diversity_history::Vector{Float64}
    stagnation_counter::Int
    bounds::Vector{Tuple{Float64, Float64}}
    
    function AntColonyOptimizer(config::ACOConfig, problem_size::Int,
                               bounds::Vector{Tuple{Float64, Float64}})
        
        colony = [Ant(problem_size) for _ in 1:config.num_ants]
        pheromone_matrix = fill(config.pheromone_init, problem_size, problem_size)
        heuristic_matrix = ones(problem_size, problem_size)
        best_ant = Ant(problem_size)
        
        new(config, colony, pheromone_matrix, heuristic_matrix, problem_size,
            best_ant, 0, Float64[], Float64[], 0, bounds)
    end
end

"""
    optimize!(optimizer::AntColonyOptimizer, objective_function::Function)

Optimize using Ant Colony Optimization algorithm.
"""
function optimize!(optimizer::AntColonyOptimizer, objective_function::Function)
    
    start_time = time()
    config = optimizer.config
    
    # Initialize heuristic information
    initialize_heuristics!(optimizer, objective_function)
    
    convergence_achieved = false
    
    for iteration in 1:config.max_iterations
        optimizer.iteration = iteration
        
        # Construct solutions for all ants
        construct_solutions!(optimizer, objective_function)
        
        # Apply local search if enabled
        if config.local_search
            local_search!(optimizer, objective_function)
        end
        
        # Update best solution
        update_best_solution!(optimizer)
        
        # Update pheromones
        update_pheromones!(optimizer)
        
        # Record statistics
        push!(optimizer.fitness_history, optimizer.best_ant.fitness)
        push!(optimizer.diversity_history, calculate_diversity(optimizer))
        
        # Check convergence
        if check_convergence(optimizer)
            convergence_achieved = true
            break
        end
        
        # Apply adaptive mechanisms
        apply_adaptive_mechanisms!(optimizer, iteration)
    end
    
    computation_time = time() - start_time
    
    return ACOResult(
        copy(optimizer.best_ant.solution),
        copy(optimizer.best_ant.path),
        optimizer.best_ant.fitness,
        copy(optimizer.fitness_history),
        convergence_achieved ? optimizer.iteration : -1,
        optimizer.iteration,
        computation_time,
        convergence_achieved,
        copy(optimizer.diversity_history),
        copy(optimizer.pheromone_matrix)
    )
end

"""
Initialize heuristic information based on problem structure
"""
function initialize_heuristics!(optimizer::AntColonyOptimizer, objective_function::Function)
    config = optimizer.config
    n = optimizer.problem_size
    
    # Sample random points to estimate heuristic information
    sample_size = min(100, n * 5)
    samples = []
    
    for _ in 1:sample_size
        solution = [bounds[i][1] + rand() * (bounds[i][2] - bounds[i][1]) 
                   for (i, bounds) in enumerate(optimizer.bounds)]
        try
            fitness = objective_function(solution)
            push!(samples, (solution, fitness))
        catch e
            # Skip invalid solutions
        end
    end
    
    if !isempty(samples)
        # Calculate heuristic based on solution quality and distance
        for i in 1:n
            for j in 1:n
                if i != j
                    # Heuristic based on average improvement when moving from i to j
                    heuristic_value = calculate_transition_heuristic(i, j, samples)
                    optimizer.heuristic_matrix[i, j] = max(0.1, heuristic_value)^config.heuristic_power
                end
            end
        end
    end
end

"""
Calculate heuristic value for transition between nodes
"""
function calculate_transition_heuristic(from_node::Int, to_node::Int, samples::Vector)
    if isempty(samples)
        return 1.0
    end
    
    # Simple heuristic based on fitness variance
    fitness_values = [fitness for (_, fitness) in samples]
    fitness_range = maximum(fitness_values) - minimum(fitness_values)
    
    return 1.0 / (1.0 + fitness_range * abs(from_node - to_node) / length(samples))
end

"""
Construct solutions for all ants in the colony
"""
function construct_solutions!(optimizer::AntColonyOptimizer, objective_function::Function)
    
    for ant in optimizer.colony
        # Reset ant
        empty!(ant.visited)
        ant.path = Int[]
        ant.current_node = rand(1:optimizer.problem_size)
        ant.path_cost = 0.0
        
        # Build solution path
        push!(ant.path, ant.current_node)
        push!(ant.visited, ant.current_node)
        
        # Construct complete path
        while length(ant.visited) < optimizer.problem_size
            next_node = select_next_node(optimizer, ant)
            move_ant!(ant, next_node)
        end
        
        # Convert path to continuous solution
        convert_path_to_solution!(optimizer, ant)
        
        # Evaluate solution
        try
            ant.fitness = objective_function(ant.solution)
        catch e
            ant.fitness = Inf
        end
    end
end

"""
Select next node for ant based on pheromone and heuristic information
"""
function select_next_node(optimizer::AntColonyOptimizer, ant::Ant)
    config = optimizer.config
    current = ant.current_node
    
    # Get unvisited nodes
    unvisited = [i for i in 1:optimizer.problem_size if i ∉ ant.visited]
    
    if isempty(unvisited)
        return current
    end
    
    # Exploitation vs exploration
    if rand() < config.q0
        # Exploitation: choose best node
        best_node = unvisited[1]
        best_value = -Inf
        
        for node in unvisited
            pheromone = optimizer.pheromone_matrix[current, node]
            heuristic = optimizer.heuristic_matrix[current, node]
            value = (pheromone^config.alpha) * (heuristic^config.beta)
            
            if value > best_value
                best_value = value
                best_node = node
            end
        end
        
        return best_node
    else
        # Exploration: probabilistic selection
        probabilities = Float64[]
        total_probability = 0.0
        
        for node in unvisited
            pheromone = optimizer.pheromone_matrix[current, node]
            heuristic = optimizer.heuristic_matrix[current, node]
            prob = (pheromone^config.alpha) * (heuristic^config.beta)
            push!(probabilities, prob)
            total_probability += prob
        end
        
        if total_probability == 0.0
            return rand(unvisited)
        end
        
        # Normalize probabilities
        probabilities ./= total_probability
        
        # Roulette wheel selection
        r = rand()
        cumulative = 0.0
        
        for (i, prob) in enumerate(probabilities)
            cumulative += prob
            if r <= cumulative
                return unvisited[i]
            end
        end
        
        return unvisited[end]
    end
end

"""
Move ant to next node
"""
function move_ant!(ant::Ant, next_node::Int)
    # Calculate transition cost (for path optimization problems)
    transition_cost = abs(next_node - ant.current_node)
    ant.path_cost += transition_cost
    
    # Update ant state
    push!(ant.path, next_node)
    push!(ant.visited, next_node)
    ant.current_node = next_node
end

"""
Convert ant path to continuous solution vector
"""
function convert_path_to_solution!(optimizer::AntColonyOptimizer, ant::Ant)
    bounds = optimizer.bounds
    n = length(bounds)
    
    # Method 1: Use path as permutation for parameter ordering
    if length(ant.path) >= n
        solution = zeros(n)
        for i in 1:n
            # Map path position to parameter value
            path_position = ant.path[mod1(i, length(ant.path))]
            normalized_pos = (path_position - 1) / (optimizer.problem_size - 1)
            
            lower, upper = bounds[i]
            solution[i] = lower + normalized_pos * (upper - lower)
        end
        ant.solution = solution
    else
        # Fallback: random solution within bounds
        ant.solution = [bounds[i][1] + rand() * (bounds[i][2] - bounds[i][1]) 
                       for i in 1:n]
    end
end

"""
Apply local search to improve solutions
"""
function local_search!(optimizer::AntColonyOptimizer, objective_function::Function)
    # Apply 2-opt local search to best ants
    elite_size = min(optimizer.config.elite_ants, length(optimizer.colony))
    sorted_ants = sort(optimizer.colony, by=ant -> ant.fitness)
    
    for i in 1:elite_size
        ant = sorted_ants[i]
        improved_solution = two_opt_local_search(ant.solution, objective_function, optimizer.bounds)
        
        if !isnothing(improved_solution)
            ant.solution = improved_solution
            try
                ant.fitness = objective_function(ant.solution)
            catch e
                # Keep original if improvement failed
            end
        end
    end
end

"""
2-opt local search for continuous optimization
"""
function two_opt_local_search(solution::Vector{Float64}, objective_function::Function,
                             bounds::Vector{Tuple{Float64, Float64}})
    
    best_solution = copy(solution)
    best_fitness = try
        objective_function(solution)
    catch e
        return nothing
    end
    
    n = length(solution)
    improved = true
    max_iterations = min(50, n * 2)
    
    for iter in 1:max_iterations
        if !improved
            break
        end
        improved = false
        
        for i in 1:n
            for j in (i+1):n
                # Create neighbor by swapping elements i and j
                neighbor = copy(best_solution)
                neighbor[i], neighbor[j] = neighbor[j], neighbor[i]
                
                # Ensure bounds compliance
                for k in 1:n
                    lower, upper = bounds[k]
                    neighbor[k] = clamp(neighbor[k], lower, upper)
                end
                
                # Evaluate neighbor
                try
                    neighbor_fitness = objective_function(neighbor)
                    if neighbor_fitness < best_fitness
                        best_solution = neighbor
                        best_fitness = neighbor_fitness
                        improved = true
                    end
                catch e
                    # Skip invalid neighbors
                end
            end
        end
    end
    
    return best_solution
end

"""
Update best solution found so far
"""
function update_best_solution!(optimizer::AntColonyOptimizer)
    for ant in optimizer.colony
        if ant.fitness < optimizer.best_ant.fitness
            optimizer.best_ant.solution = copy(ant.solution)
            optimizer.best_ant.path = copy(ant.path)
            optimizer.best_ant.fitness = ant.fitness
            optimizer.best_ant.path_cost = ant.path_cost
            optimizer.stagnation_counter = 0
        end
    end
    optimizer.stagnation_counter += 1
end

"""
Update pheromone trails
"""
function update_pheromones!(optimizer::AntColonyOptimizer)
    config = optimizer.config
    
    # Evaporation
    optimizer.pheromone_matrix .*= (1.0 - config.rho)
    
    # Deposit pheromones
    if config.elite_ants > 0
        # Elite ant system: only best ants deposit pheromones
        sorted_ants = sort(optimizer.colony, by=ant -> ant.fitness)
        elite_ants = sorted_ants[1:min(config.elite_ants, length(sorted_ants))]
        
        for ant in elite_ants
            if ant.fitness != Inf
                deposit_pheromones!(optimizer, ant)
            end
        end
        
        # Best ant deposits additional pheromones
        if optimizer.best_ant.fitness != Inf
            deposit_pheromones!(optimizer, optimizer.best_ant, weight=2.0)
        end
    else
        # All ants deposit pheromones
        for ant in optimizer.colony
            if ant.fitness != Inf
                deposit_pheromones!(optimizer, ant)
            end
        end
    end
    
    # Apply min-max bounds
    clamp!(optimizer.pheromone_matrix, config.tau_min, config.tau_max)
end

"""
Deposit pheromones for an ant's path
"""
function deposit_pheromones!(optimizer::AntColonyOptimizer, ant::Ant; weight::Float64 = 1.0)
    if isempty(ant.path) || ant.fitness == Inf
        return
    end
    
    # Pheromone amount inversely related to fitness (lower fitness = more pheromones)
    pheromone_amount = weight / (1.0 + ant.fitness)
    
    # Deposit along path
    for i in 1:(length(ant.path)-1)
        from_node = ant.path[i]
        to_node = ant.path[i+1]
        optimizer.pheromone_matrix[from_node, to_node] += pheromone_amount
        optimizer.pheromone_matrix[to_node, from_node] += pheromone_amount  # Symmetric
    end
    
    # Also connect last to first for cyclic paths
    if length(ant.path) > 2
        last_node = ant.path[end]
        first_node = ant.path[1]
        optimizer.pheromone_matrix[last_node, first_node] += pheromone_amount * 0.5
        optimizer.pheromone_matrix[first_node, last_node] += pheromone_amount * 0.5
    end
end

"""
Calculate colony diversity
"""
function calculate_diversity(optimizer::AntColonyOptimizer)
    solutions = [ant.solution for ant in optimizer.colony if !isempty(ant.solution)]
    
    if length(solutions) < 2
        return 1.0
    end
    
    center = mean(solutions)
    diversity = 0.0
    
    for solution in solutions
        diversity += norm(solution - center)
    end
    
    return diversity / length(solutions)
end

"""
Check for convergence
"""
function check_convergence(optimizer::AntColonyOptimizer)
    config = optimizer.config
    
    # Check diversity convergence
    if length(optimizer.diversity_history) > 10
        recent_diversity = mean(optimizer.diversity_history[end-9:end])
        if recent_diversity < config.convergence_threshold
            return true
        end
    end
    
    # Check stagnation
    if optimizer.stagnation_counter > 30
        return true
    end
    
    return false
end

"""
Apply adaptive mechanisms
"""
function apply_adaptive_mechanisms!(optimizer::AntColonyOptimizer, iteration::Int)
    config = optimizer.config
    
    # Adaptive pheromone bounds
    if iteration % 20 == 0
        diversity = length(optimizer.diversity_history) > 0 ? 
                   optimizer.diversity_history[end] : 1.0
        
        if diversity < 0.1  # Low diversity
            # Increase exploration
            config.q0 = max(0.1, config.q0 - 0.1)
            config.rho = min(0.9, config.rho + 0.05)
        elseif diversity > 0.8  # High diversity
            # Increase exploitation
            config.q0 = min(0.95, config.q0 + 0.1)
            config.rho = max(0.05, config.rho - 0.05)
        end
    end
    
    # Pheromone restart for extreme stagnation
    if optimizer.stagnation_counter > 50
        optimizer.pheromone_matrix .= config.pheromone_init
        optimizer.stagnation_counter = 0
    end
end

# Specialized ACO variants

"""
Standard ACO implementation
"""
function StandardACO(problem_size::Int, bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = ACOConfig(; elite_ants=0, kwargs...)
    return AntColonyOptimizer(config, problem_size, bounds)
end

"""
Max-Min Ant System (MMAS)
"""
function MaxMinACO(problem_size::Int, bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = ACOConfig(;
        elite_ants=1,
        tau_min=0.01,
        tau_max=10.0,
        rho=0.02,
        kwargs...)
    return AntColonyOptimizer(config, problem_size, bounds)
end

"""
Elitist Ant System
"""
function ElitistACO(problem_size::Int, bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = ACOConfig(;
        elite_ants=5,
        q0=0.95,
        local_search=true,
        kwargs...)
    return AntColonyOptimizer(config, problem_size, bounds)
end

"""
Ranked Ant System
"""
function RankedACO(problem_size::Int, bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = ACOConfig(;
        elite_ants=3,
        alpha=1.5,
        beta=3.0,
        rho=0.1,
        kwargs...)
    return AntColonyOptimizer(config, problem_size, bounds)
end

# Trading-specific utilities

"""
Optimize portfolio allocation using ACO
"""
function optimize_portfolio_aco(assets::Vector{String}, expected_returns::Vector{Float64},
                               covariance_matrix::Matrix{Float64}; 
                               risk_tolerance::Float64 = 0.5,
                               aco_config::ACOConfig = ACOConfig())
    
    n_assets = length(assets)
    
    # Bounds: portfolio weights must sum to 1
    bounds = [(0.0, 1.0) for _ in 1:n_assets]
    
    optimizer = AntColonyOptimizer(aco_config, n_assets, bounds)
    
    function portfolio_objective(weights)
        # Normalize weights to sum to 1
        w = weights ./ sum(weights)
        
        # Calculate portfolio return and risk
        portfolio_return = dot(w, expected_returns)
        portfolio_variance = w' * covariance_matrix * w
        portfolio_risk = sqrt(portfolio_variance)
        
        # Risk-adjusted return (negative because we minimize)
        risk_adjusted_return = portfolio_return - risk_tolerance * portfolio_risk
        
        return -risk_adjusted_return
    end
    
    return optimize!(optimizer, portfolio_objective)
end

"""
Optimize trading execution path using ACO
"""
function optimize_execution_path_aco(order_sizes::Vector{Float64},
                                    market_impact_matrix::Matrix{Float64},
                                    time_horizon::Int;
                                    aco_config::ACOConfig = ACOConfig())
    
    n_orders = length(order_sizes)
    
    # Bounds for execution timing and sizing
    bounds = [(0.0, 1.0) for _ in 1:n_orders]  # Fraction of time horizon
    
    optimizer = AntColonyOptimizer(aco_config, n_orders, bounds)
    
    function execution_objective(timing_fractions)
        # Convert to actual execution times
        execution_times = Int.(round.(timing_fractions * time_horizon))
        execution_times = clamp.(execution_times, 1, time_horizon)
        
        # Calculate total market impact and timing cost
        total_cost = 0.0
        
        for i in 1:n_orders
            for j in 1:n_orders
                if i != j
                    # Market impact between orders
                    time_diff = abs(execution_times[i] - execution_times[j])
                    impact = market_impact_matrix[i, j] * exp(-0.1 * time_diff)
                    total_cost += impact * order_sizes[i] * order_sizes[j]
                end
            end
            
            # Timing penalty (earlier is generally better)
            timing_penalty = execution_times[i] * 0.01
            total_cost += timing_penalty * order_sizes[i]
        end
        
        return total_cost
    end
    
    return optimize!(optimizer, execution_objective)
end

end # module