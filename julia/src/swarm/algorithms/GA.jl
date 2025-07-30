"""
GA.jl - Genetic Algorithm Implementation

Advanced Genetic Algorithm with multiple selection strategies, crossover operators,
mutation schemes, and specialized features for trading strategy evolution and
multi-objective portfolio optimization.
"""
module GA

export GeneticOptimizer, optimize!, Individual, GAConfig, GAResult
export StandardGA, ElitistGA, MultiobjGA, AdaptiveGA

using Random
using Statistics
using LinearAlgebra
using Dates

# GA Configuration
mutable struct GAConfig
    population_size::Int
    max_generations::Int
    elite_size::Int
    mutation_rate::Float64
    crossover_rate::Float64
    selection_strategy::Symbol     # :tournament, :roulette, :rank, :stochastic
    crossover_strategy::Symbol     # :single_point, :two_point, :uniform, :arithmetic
    mutation_strategy::Symbol      # :gaussian, :uniform, :polynomial, :adaptive
    tournament_size::Int
    pressure::Float64              # Selection pressure
    adaptive_rates::Bool           # Adaptive mutation/crossover rates
    niching::Bool                  # Niching for diversity
    convergence_threshold::Float64
    diversity_threshold::Float64
    
    function GAConfig(;
        population_size::Int = 50,
        max_generations::Int = 100,
        elite_size::Int = 5,
        mutation_rate::Float64 = 0.1,
        crossover_rate::Float64 = 0.8,
        selection_strategy::Symbol = :tournament,
        crossover_strategy::Symbol = :arithmetic,
        mutation_strategy::Symbol = :gaussian,
        tournament_size::Int = 5,
        pressure::Float64 = 2.0,
        adaptive_rates::Bool = true,
        niching::Bool = false,
        convergence_threshold::Float64 = 1e-6,
        diversity_threshold::Float64 = 0.01
    )
        new(population_size, max_generations, elite_size, mutation_rate,
            crossover_rate, selection_strategy, crossover_strategy, mutation_strategy,
            tournament_size, pressure, adaptive_rates, niching,
            convergence_threshold, diversity_threshold)
    end
end

# Individual structure
mutable struct Individual
    genes::Vector{Float64}        # Solution representation
    fitness::Float64              # Fitness value
    objectives::Vector{Float64}   # Multi-objective values
    age::Int                      # Age for aging mechanisms
    niche_count::Float64          # Niche count for sharing
    
    function Individual(genes::Vector{Float64})
        new(genes, Inf, Float64[], 0, 0.0)
    end
end

# GA Result
struct GAResult
    best_individual::Individual
    population::Vector{Individual}
    fitness_history::Vector{Float64}
    diversity_history::Vector{Float64}
    pareto_front::Vector{Individual}  # For multi-objective
    convergence_generation::Int
    total_generations::Int
    computation_time::Float64
    convergence_achieved::Bool
    
    function GAResult(best_ind, pop, fit_hist, div_hist, pareto, conv_gen,
                     total_gen, comp_time, converged)
        new(best_ind, pop, fit_hist, div_hist, pareto, conv_gen,
            total_gen, comp_time, converged)
    end
end

# Main GA Optimizer
mutable struct GeneticOptimizer
    config::GAConfig
    population::Vector{Individual}
    bounds::Vector{Tuple{Float64, Float64}}
    dimensions::Int
    generation::Int
    fitness_history::Vector{Float64}
    diversity_history::Vector{Float64}
    pareto_front::Vector{Individual}
    best_individual::Individual
    stagnation_counter::Int
    current_mutation_rate::Float64
    current_crossover_rate::Float64
    
    function GeneticOptimizer(config::GAConfig, bounds::Vector{Tuple{Float64, Float64}})
        dimensions = length(bounds)
        population = Vector{Individual}()
        best_individual = Individual(zeros(dimensions))
        
        new(config, population, bounds, dimensions, 0,
            Float64[], Float64[], Vector{Individual}(),
            best_individual, 0, config.mutation_rate, config.crossover_rate)
    end
end

"""
    optimize!(optimizer::GeneticOptimizer, objective_function::Function)

Optimize using Genetic Algorithm.
"""
function optimize!(optimizer::GeneticOptimizer, objective_function::Function;
                  is_multiobjective::Bool = false)
    
    start_time = time()
    config = optimizer.config
    
    # Initialize population
    initialize_population!(optimizer, objective_function)
    
    convergence_achieved = false
    
    for generation in 1:config.max_generations
        optimizer.generation = generation
        
        # Selection and reproduction
        new_population = Vector{Individual}()
        
        # Elitism: preserve best individuals
        if config.elite_size > 0
            elite = get_elite(optimizer.population, config.elite_size)
            append!(new_population, elite)
        end
        
        # Generate offspring to fill remaining population
        while length(new_population) < config.population_size
            # Selection
            parent1 = select_individual(optimizer)
            parent2 = select_individual(optimizer)
            
            # Crossover
            if rand() < optimizer.current_crossover_rate
                offspring1, offspring2 = crossover(parent1, parent2, optimizer.config, optimizer.bounds)
                
                # Mutation
                if rand() < optimizer.current_mutation_rate
                    mutate!(offspring1, optimizer.config, optimizer.bounds, generation)
                end
                if rand() < optimizer.current_mutation_rate
                    mutate!(offspring2, optimizer.config, optimizer.bounds, generation)
                end
                
                push!(new_population, offspring1)
                if length(new_population) < config.population_size
                    push!(new_population, offspring2)
                end
            else
                # Copy parents if no crossover
                push!(new_population, deepcopy(parent1))
                if length(new_population) < config.population_size
                    push!(new_population, deepcopy(parent2))
                end
            end
        end
        
        # Trim to exact population size
        resize!(new_population, config.population_size)
        optimizer.population = new_population
        
        # Evaluate new population
        evaluate_population!(optimizer, objective_function, is_multiobjective)
        
        # Update best individual
        update_best_individual!(optimizer)
        
        # Update Pareto front for multi-objective
        if is_multiobjective
            update_pareto_front!(optimizer)
        end
        
        # Record statistics
        push!(optimizer.fitness_history, optimizer.best_individual.fitness)
        push!(optimizer.diversity_history, calculate_diversity(optimizer))
        
        # Adaptive parameter adjustment
        if config.adaptive_rates
            adapt_parameters!(optimizer, generation)
        end
        
        # Niching for diversity maintenance
        if config.niching
            apply_niching!(optimizer)
        end
        
        # Check convergence
        if check_convergence(optimizer)
            convergence_achieved = true
            break
        end
        
        # Age population
        age_population!(optimizer)
    end
    
    computation_time = time() - start_time
    
    return GAResult(
        deepcopy(optimizer.best_individual),
        deepcopy(optimizer.population),
        copy(optimizer.fitness_history),
        copy(optimizer.diversity_history),
        deepcopy(optimizer.pareto_front),
        convergence_achieved ? optimizer.generation : -1,
        optimizer.generation,
        computation_time,
        convergence_achieved
    )
end

"""
Initialize population randomly within bounds
"""
function initialize_population!(optimizer::GeneticOptimizer, objective_function::Function)
    config = optimizer.config
    
    for _ in 1:config.population_size
        genes = [bounds[1] + rand() * (bounds[2] - bounds[1]) 
                for bounds in optimizer.bounds]
        individual = Individual(genes)
        push!(optimizer.population, individual)
    end
    
    # Evaluate initial population
    evaluate_population!(optimizer, objective_function, false)
    update_best_individual!(optimizer)
end

"""
Evaluate population fitness
"""
function evaluate_population!(optimizer::GeneticOptimizer, objective_function::Function,
                             is_multiobjective::Bool)
    
    for individual in optimizer.population
        try
            if is_multiobjective
                # Multi-objective optimization
                objectives = objective_function(individual.genes)
                individual.objectives = objectives
                # Use weighted sum as fitness for single-objective tracking
                individual.fitness = sum(objectives)
            else
                # Single-objective optimization
                individual.fitness = objective_function(individual.genes)
            end
        catch e
            individual.fitness = Inf
            if is_multiobjective
                individual.objectives = fill(Inf, length(individual.objectives))
            end
        end
    end
end

"""
Select individual using configured selection strategy
"""
function select_individual(optimizer::GeneticOptimizer)
    config = optimizer.config
    population = optimizer.population
    
    if config.selection_strategy == :tournament
        return tournament_selection(population, config.tournament_size)
    elseif config.selection_strategy == :roulette
        return roulette_selection(population)
    elseif config.selection_strategy == :rank
        return rank_selection(population, config.pressure)
    elseif config.selection_strategy == :stochastic
        return stochastic_universal_sampling(population)
    else
        return rand(population)
    end
end

"""
Tournament selection
"""
function tournament_selection(population::Vector{Individual}, tournament_size::Int)
    tournament = sample(population, tournament_size, replace=false)
    return minimum(tournament, key=ind -> ind.fitness)
end

"""
Roulette wheel selection
"""
function roulette_selection(population::Vector{Individual})
    # Convert fitness to positive values (minimize fitness)
    max_fitness = maximum(ind.fitness for ind in population if ind.fitness != Inf)
    weights = [(max_fitness - ind.fitness + 1.0) for ind in population]
    
    total_weight = sum(weights)
    if total_weight == 0
        return rand(population)
    end
    
    r = rand() * total_weight
    cumulative = 0.0
    
    for (i, weight) in enumerate(weights)
        cumulative += weight
        if r <= cumulative
            return population[i]
        end
    end
    
    return population[end]
end

"""
Rank-based selection
"""
function rank_selection(population::Vector{Individual}, pressure::Float64)
    sorted_pop = sort(population, by=ind -> ind.fitness)
    n = length(sorted_pop)
    
    # Linear ranking
    ranks = [(2 - pressure) + 2 * (pressure - 1) * (i - 1) / (n - 1) 
            for i in 1:n]
    
    total_rank = sum(ranks)
    r = rand() * total_rank
    cumulative = 0.0
    
    for (i, rank) in enumerate(ranks)
        cumulative += rank
        if r <= cumulative
            return sorted_pop[i]
        end
    end
    
    return sorted_pop[end]
end

"""
Stochastic universal sampling
"""
function stochastic_universal_sampling(population::Vector{Individual})
    # Simplified version - random selection with fitness weighting
    return roulette_selection(population)
end

"""
Crossover operation
"""
function crossover(parent1::Individual, parent2::Individual, config::GAConfig,
                  bounds::Vector{Tuple{Float64, Float64}})
    
    if config.crossover_strategy == :single_point
        return single_point_crossover(parent1, parent2)
    elseif config.crossover_strategy == :two_point
        return two_point_crossover(parent1, parent2)
    elseif config.crossover_strategy == :uniform
        return uniform_crossover(parent1, parent2)
    elseif config.crossover_strategy == :arithmetic
        return arithmetic_crossover(parent1, parent2, bounds)
    else
        return deepcopy(parent1), deepcopy(parent2)
    end
end

"""
Single-point crossover
"""
function single_point_crossover(parent1::Individual, parent2::Individual)
    n = length(parent1.genes)
    point = rand(1:n-1)
    
    genes1 = vcat(parent1.genes[1:point], parent2.genes[point+1:end])
    genes2 = vcat(parent2.genes[1:point], parent1.genes[point+1:end])
    
    return Individual(genes1), Individual(genes2)
end

"""
Two-point crossover
"""
function two_point_crossover(parent1::Individual, parent2::Individual)
    n = length(parent1.genes)
    point1 = rand(1:n-1)
    point2 = rand(point1+1:n)
    
    genes1 = vcat(parent1.genes[1:point1], parent2.genes[point1+1:point2], 
                 parent1.genes[point2+1:end])
    genes2 = vcat(parent2.genes[1:point1], parent1.genes[point1+1:point2], 
                 parent2.genes[point2+1:end])
    
    return Individual(genes1), Individual(genes2)
end

"""
Uniform crossover
"""
function uniform_crossover(parent1::Individual, parent2::Individual)
    n = length(parent1.genes)
    mask = rand(Bool, n)
    
    genes1 = [mask[i] ? parent1.genes[i] : parent2.genes[i] for i in 1:n]
    genes2 = [mask[i] ? parent2.genes[i] : parent1.genes[i] for i in 1:n]
    
    return Individual(genes1), Individual(genes2)
end

"""
Arithmetic crossover (for continuous optimization)
"""
function arithmetic_crossover(parent1::Individual, parent2::Individual,
                             bounds::Vector{Tuple{Float64, Float64}})
    
    alpha = rand()
    
    genes1 = alpha * parent1.genes + (1 - alpha) * parent2.genes
    genes2 = alpha * parent2.genes + (1 - alpha) * parent1.genes
    
    # Ensure bounds compliance
    for (i, (lower, upper)) in enumerate(bounds)
        genes1[i] = clamp(genes1[i], lower, upper)
        genes2[i] = clamp(genes2[i], lower, upper)
    end
    
    return Individual(genes1), Individual(genes2)
end

"""
Mutation operation
"""
function mutate!(individual::Individual, config::GAConfig,
                bounds::Vector{Tuple{Float64, Float64}}, generation::Int)
    
    if config.mutation_strategy == :gaussian
        gaussian_mutation!(individual, bounds)
    elseif config.mutation_strategy == :uniform
        uniform_mutation!(individual, bounds)
    elseif config.mutation_strategy == :polynomial
        polynomial_mutation!(individual, bounds)
    elseif config.mutation_strategy == :adaptive
        adaptive_mutation!(individual, bounds, generation, config.max_generations)
    end
end

"""
Gaussian mutation
"""
function gaussian_mutation!(individual::Individual, bounds::Vector{Tuple{Float64, Float64}})
    for i in 1:length(individual.genes)
        if rand() < 0.1  # Gene-wise mutation probability
            lower, upper = bounds[i]
            range = upper - lower
            sigma = range * 0.1  # 10% of range as standard deviation
            
            individual.genes[i] += randn() * sigma
            individual.genes[i] = clamp(individual.genes[i], lower, upper)
        end
    end
end

"""
Uniform mutation
"""
function uniform_mutation!(individual::Individual, bounds::Vector{Tuple{Float64, Float64}})
    for i in 1:length(individual.genes)
        if rand() < 0.1
            lower, upper = bounds[i]
            individual.genes[i] = lower + rand() * (upper - lower)
        end
    end
end

"""
Polynomial mutation
"""
function polynomial_mutation!(individual::Individual, bounds::Vector{Tuple{Float64, Float64}})
    eta = 20.0  # Distribution index
    
    for i in 1:length(individual.genes)
        if rand() < 0.1
            lower, upper = bounds[i]
            y = individual.genes[i]
            
            delta1 = (y - lower) / (upper - lower)
            delta2 = (upper - y) / (upper - lower)
            
            rnd = rand()
            mut_pow = 1.0 / (eta + 1.0)
            
            if rnd <= 0.5
                xy = 1.0 - delta1
                val = 2.0 * rnd + (1.0 - 2.0 * rnd) * xy^(eta + 1)
                deltaq = val^mut_pow - 1.0
            else
                xy = 1.0 - delta2
                val = 2.0 * (1.0 - rnd) + 2.0 * (rnd - 0.5) * xy^(eta + 1)
                deltaq = 1.0 - val^mut_pow
            end
            
            y = y + deltaq * (upper - lower)
            individual.genes[i] = clamp(y, lower, upper)
        end
    end
end

"""
Adaptive mutation based on generation
"""
function adaptive_mutation!(individual::Individual, bounds::Vector{Tuple{Float64, Float64}},
                           generation::Int, max_generations::Int)
    
    # Decrease mutation strength over generations
    progress = generation / max_generations
    strength = (1.0 - progress) * 0.2 + 0.01  # From 20% to 1%
    
    for i in 1:length(individual.genes)
        if rand() < 0.1
            lower, upper = bounds[i]
            range = upper - lower
            
            individual.genes[i] += randn() * strength * range
            individual.genes[i] = clamp(individual.genes[i], lower, upper)
        end
    end
end

"""
Update best individual
"""
function update_best_individual!(optimizer::GeneticOptimizer)
    current_best = minimum(optimizer.population, key=ind -> ind.fitness)
    
    if current_best.fitness < optimizer.best_individual.fitness
        optimizer.best_individual = deepcopy(current_best)
        optimizer.stagnation_counter = 0
    else
        optimizer.stagnation_counter += 1
    end
end

"""
Update Pareto front for multi-objective optimization
"""
function update_pareto_front!(optimizer::GeneticOptimizer)
    # Add current population to Pareto front candidates
    candidates = vcat(optimizer.pareto_front, optimizer.population)
    
    # Find non-dominated solutions
    optimizer.pareto_front = find_pareto_front(candidates)
end

"""
Find Pareto front from set of individuals
"""
function find_pareto_front(individuals::Vector{Individual})
    pareto_front = Vector{Individual}()
    
    for candidate in individuals
        is_dominated = false
        
        for other in individuals
            if dominates(other, candidate)
                is_dominated = true
                break
            end
        end
        
        if !is_dominated
            # Check if already in front (avoid duplicates)
            already_exists = any(ind -> ind.objectives == candidate.objectives, pareto_front)
            if !already_exists
                push!(pareto_front, deepcopy(candidate))
            end
        end
    end
    
    return pareto_front
end

"""
Check if individual1 dominates individual2 (Pareto dominance)
"""
function dominates(ind1::Individual, ind2::Individual)
    if isempty(ind1.objectives) || isempty(ind2.objectives)
        return ind1.fitness < ind2.fitness
    end
    
    # For minimization: ind1 dominates ind2 if ind1 is better or equal in all objectives
    # and strictly better in at least one
    all_better_or_equal = all(ind1.objectives[i] <= ind2.objectives[i] 
                            for i in 1:length(ind1.objectives))
    at_least_one_better = any(ind1.objectives[i] < ind2.objectives[i] 
                            for i in 1:length(ind1.objectives))
    
    return all_better_or_equal && at_least_one_better
end

"""
Get elite individuals
"""
function get_elite(population::Vector{Individual}, elite_size::Int)
    sorted_pop = sort(population, by=ind -> ind.fitness)
    return deepcopy(sorted_pop[1:min(elite_size, length(sorted_pop))])
end

"""
Calculate population diversity
"""
function calculate_diversity(optimizer::GeneticOptimizer)
    if length(optimizer.population) < 2
        return 1.0
    end
    
    genes_matrix = hcat([ind.genes for ind in optimizer.population]...)
    center = mean(genes_matrix, dims=2)[:, 1]
    
    diversity = 0.0
    for individual in optimizer.population
        diversity += norm(individual.genes - center)
    end
    
    return diversity / length(optimizer.population)
end

"""
Adapt parameters based on population state
"""
function adapt_parameters!(optimizer::GeneticOptimizer, generation::Int)
    config = optimizer.config
    
    # Adapt based on diversity
    diversity = length(optimizer.diversity_history) > 0 ? 
               optimizer.diversity_history[end] : 1.0
    
    if diversity < config.diversity_threshold
        # Low diversity - increase mutation
        optimizer.current_mutation_rate = min(0.5, config.mutation_rate * 1.5)
        optimizer.current_crossover_rate = max(0.5, config.crossover_rate * 0.8)
    else
        # High diversity - normal parameters
        optimizer.current_mutation_rate = config.mutation_rate
        optimizer.current_crossover_rate = config.crossover_rate
    end
    
    # Age-based adaptation
    progress = generation / config.max_generations
    if config.adaptive_rates
        # Decrease mutation rate over time
        optimizer.current_mutation_rate *= (1.0 - 0.8 * progress)
    end
end

"""
Apply niching for diversity maintenance
"""
function apply_niching!(optimizer::GeneticOptimizer)
    # Simple fitness sharing based on Euclidean distance
    sigma_share = 0.1  # Sharing radius
    
    for i in 1:length(optimizer.population)
        niche_count = 0.0
        
        for j in 1:length(optimizer.population)
            distance = norm(optimizer.population[i].genes - optimizer.population[j].genes)
            if distance < sigma_share
                sharing = 1.0 - (distance / sigma_share)
                niche_count += sharing
            end
        end
        
        optimizer.population[i].niche_count = niche_count
        if niche_count > 0
            optimizer.population[i].fitness /= niche_count  # Fitness sharing
        end
    end
end

"""
Age population (for age-based diversity)
"""
function age_population!(optimizer::GeneticOptimizer)
    for individual in optimizer.population
        individual.age += 1
    end
end

"""
Check convergence
"""
function check_convergence(optimizer::GeneticOptimizer)
    config = optimizer.config
    
    # Stagnation-based convergence
    if optimizer.stagnation_counter > 50
        return true
    end
    
    # Diversity-based convergence
    if length(optimizer.diversity_history) > 10
        recent_diversity = mean(optimizer.diversity_history[end-9:end])
        if recent_diversity < config.convergence_threshold
            return true
        end
    end
    
    return false
end

# Specialized GA variants

"""
Standard GA implementation
"""
function StandardGA(bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = GAConfig(;
        selection_strategy = :tournament,
        crossover_strategy = :single_point,
        mutation_strategy = :gaussian,
        adaptive_rates = false,
        kwargs...)
    return GeneticOptimizer(config, bounds)
end

"""
Elitist GA with strong selection pressure
"""
function ElitistGA(bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = GAConfig(;
        elite_size = 10,
        selection_strategy = :tournament,
        tournament_size = 7,
        crossover_strategy = :arithmetic,
        mutation_strategy = :adaptive,
        adaptive_rates = true,
        kwargs...)
    return GeneticOptimizer(config, bounds)
end

"""
Multi-objective GA (NSGA-II inspired)
"""
function MultiobjGA(bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = GAConfig(;
        population_size = 100,
        selection_strategy = :tournament,
        crossover_strategy = :arithmetic,
        mutation_strategy = :polynomial,
        niching = true,
        kwargs...)
    return GeneticOptimizer(config, bounds)
end

"""
Adaptive GA with dynamic parameters
"""
function AdaptiveGA(bounds::Vector{Tuple{Float64, Float64}}; kwargs...)
    config = GAConfig(;
        adaptive_rates = true,
        niching = true,
        selection_strategy = :rank,
        crossover_strategy = :arithmetic,
        mutation_strategy = :adaptive,
        pressure = 1.5,
        kwargs...)
    return GeneticOptimizer(config, bounds)
end

# Trading-specific applications

"""
Optimize trading strategy parameters using GA
"""
function optimize_trading_strategy_ga(strategy_type::Symbol, backtest_function::Function;
                                    ga_config::GAConfig = GAConfig())
    
    bounds = if strategy_type == :algorithmic_trading
        [
            (1, 100),        # fast_period
            (10, 300),       # slow_period
            (0.01, 0.3),     # signal_threshold
            (0.01, 0.5),     # position_size
            (0.001, 0.1),    # stop_loss
            (0.001, 0.1),    # take_profit
            (1, 50),         # max_holding_period
            (0.0, 1.0)       # risk_factor
        ]
    elseif strategy_type == :pairs_trading
        [
            (10, 252),       # lookback_window
            (1.0, 4.0),      # entry_threshold
            (0.0, 2.0),      # exit_threshold
            (0.01, 0.3),     # position_size
            (1, 30),         # max_holding_days
            (0.5, 0.99)      # correlation_threshold
        ]
    else
        error("Unknown strategy type: $strategy_type")
    end
    
    optimizer = GeneticOptimizer(ga_config, bounds)
    
    function trading_objective(params)
        try
            result = backtest_function(params)
            
            # Multi-objective fitness combining several metrics
            sharpe_ratio = get(result, "sharpe_ratio", -10.0)
            max_drawdown = get(result, "max_drawdown", 1.0)
            total_return = get(result, "total_return", -1.0)
            win_rate = get(result, "win_rate", 0.0)
            profit_factor = get(result, "profit_factor", 0.0)
            
            # Weighted composite score (minimize negative performance)
            score = -(0.3 * sharpe_ratio + 
                     0.2 * total_return +
                     0.2 * win_rate +
                     0.15 * profit_factor -
                     0.15 * max_drawdown)
            
            return score
        catch e
            return 1000.0  # High penalty
        end
    end
    
    return optimize!(optimizer, trading_objective)
end

"""
Multi-objective portfolio optimization using GA
"""
function optimize_portfolio_multiobjective_ga(expected_returns::Vector{Float64},
                                             covariance_matrix::Matrix{Float64},
                                             constraints::Dict{String, Float64} = Dict();
                                             ga_config::GAConfig = GAConfig())
    
    n_assets = length(expected_returns)
    bounds = [(0.0, 1.0) for _ in 1:n_assets]  # Portfolio weights
    
    optimizer = MultiobjGA(bounds; ga_config...)
    
    function portfolio_objectives(weights)
        # Normalize weights
        w = weights ./ sum(weights)
        
        # Calculate objectives to minimize
        portfolio_return = -dot(w, expected_returns)  # Negative for minimization
        portfolio_risk = sqrt(w' * covariance_matrix * w)
        
        # Add constraint penalties
        penalty = 0.0
        if haskey(constraints, "max_single_weight")
            max_weight = constraints["max_single_weight"]
            penalty += sum(max(0, weight - max_weight) for weight in w) * 10
        end
        
        return [portfolio_return + penalty, portfolio_risk + penalty]
    end
    
    return optimize!(optimizer, portfolio_objectives; is_multiobjective=true)
end

end # module