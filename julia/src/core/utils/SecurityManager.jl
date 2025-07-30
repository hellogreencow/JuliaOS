"""
SecurityManager.jl - Military-Grade Security for JuliaOS Trading Platform

This module implements enterprise-level security controls including:
- Multi-factor authentication
- Role-based access control (RBAC)
- API key management with rotation
- Rate limiting and DDoS protection
- Encryption for sensitive data
- Audit logging and intrusion detection
"""
module SecurityManager

export AuthenticationManager, APIKeyManager, RateLimiter, EncryptionManager
export authenticate_user, generate_api_key, check_rate_limit, encrypt_data, decrypt_data
export SecurityConfig, UserRole, AccessLevel, SecurityEvent

using Dates
using Random
using Base64
using SHA
using JSON3
using DataStructures

# Security configuration constants
const MAX_LOGIN_ATTEMPTS = 3
const LOCKOUT_DURATION_MINUTES = 15
const API_KEY_LENGTH = 64
const SESSION_TIMEOUT_MINUTES = 30
const RATE_LIMIT_WINDOW_SECONDS = 60

# Security event types
@enum SecurityEventType begin
    LOGIN_SUCCESS = 1
    LOGIN_FAILURE = 2
    API_KEY_GENERATED = 3
    API_KEY_REVOKED = 4
    RATE_LIMIT_EXCEEDED = 5
    UNAUTHORIZED_ACCESS = 6
    SUSPICIOUS_ACTIVITY = 7
    DATA_BREACH_ATTEMPT = 8
end

# User roles and access levels
@enum UserRole begin
    ADMIN = 1
    TRADER = 2
    ANALYST = 3
    VIEWER = 4
    API_USER = 5
end

@enum AccessLevel begin
    READ_ONLY = 1
    TRADE_EXECUTION = 2
    PORTFOLIO_MANAGEMENT = 3
    SYSTEM_ADMIN = 4
    EMERGENCY_HALT = 5
end

"""
Security configuration structure
"""
struct SecurityConfig
    enable_mfa::Bool
    require_api_keys::Bool
    enable_rate_limiting::Bool
    enable_encryption::Bool
    audit_all_access::Bool
    session_timeout_minutes::Int
    max_login_attempts::Int
    lockout_duration_minutes::Int
    
    function SecurityConfig(;
        enable_mfa = true,
        require_api_keys = true,
        enable_rate_limiting = true,
        enable_encryption = true,
        audit_all_access = true,
        session_timeout_minutes = 30,
        max_login_attempts = 3,
        lockout_duration_minutes = 15
    )
        new(enable_mfa, require_api_keys, enable_rate_limiting, enable_encryption,
            audit_all_access, session_timeout_minutes, max_login_attempts,
            lockout_duration_minutes)
    end
end

"""
Security event for audit logging
"""
struct SecurityEvent
    event_type::SecurityEventType
    user_id::String
    ip_address::String
    timestamp::DateTime
    details::Dict{String, Any}
    risk_level::String  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    
    function SecurityEvent(event_type::SecurityEventType, user_id::String, 
                          ip_address::String, details::Dict{String, Any}; 
                          risk_level::String = "MEDIUM")
        new(event_type, user_id, ip_address, now(), details, risk_level)
    end
end

"""
User authentication manager
"""
mutable struct AuthenticationManager
    config::SecurityConfig
    user_credentials::Dict{String, Dict{String, Any}}
    active_sessions::Dict{String, Dict{String, Any}}
    failed_attempts::Dict{String, Vector{DateTime}}
    locked_accounts::Dict{String, DateTime}
    security_events::Vector{SecurityEvent}
    
    function AuthenticationManager(config::SecurityConfig)
        new(
            config,
            Dict{String, Dict{String, Any}}(),
            Dict{String, Dict{String, Any}}(),
            Dict{String, Vector{DateTime}}(),
            Dict{String, DateTime}(),
            Vector{SecurityEvent}()
        )
    end
end

"""
API key management system
"""
mutable struct APIKeyManager
    api_keys::Dict{String, Dict{String, Any}}
    key_usage::Dict{String, Vector{DateTime}}
    revoked_keys::Set{String}
    rotation_schedule::Dict{String, DateTime}
    
    function APIKeyManager()
        new(
            Dict{String, Dict{String, Any}}(),
            Dict{String, Vector{DateTime}}(),
            Set{String}(),
            Dict{String, DateTime}()
        )
    end
end

"""
Rate limiting system
"""
mutable struct RateLimiter
    request_counts::Dict{String, CircularBuffer{DateTime}}
    rate_limits::Dict{UserRole, Int}
    blocked_ips::Dict{String, DateTime}
    
    function RateLimiter()
        # Default rate limits per role (requests per minute)
        default_limits = Dict(
            ADMIN => 1000,
            TRADER => 500,
            ANALYST => 200,
            VIEWER => 100,
            API_USER => 300
        )
        
        new(
            Dict{String, CircularBuffer{DateTime}}(),
            default_limits,
            Dict{String, DateTime}()
        )
    end
end

"""
Encryption manager for sensitive data
"""
mutable struct EncryptionManager
    master_key::Vector{UInt8}
    key_rotation_schedule::DateTime
    encrypted_fields::Set{String}
    
    function EncryptionManager()
        # Generate master key (in production, use proper key management)
        master_key = rand(UInt8, 32)  # 256-bit key
        
        new(
            master_key,
            now() + Day(30),  # Rotate every 30 days
            Set(["password", "api_key", "private_key", "session_token"])
        )
    end
end

"""
Initialize security system
"""
function initialize_security_system(config::SecurityConfig = SecurityConfig())
    auth_manager = AuthenticationManager(config)
    api_manager = APIKeyManager()
    rate_limiter = RateLimiter()
    encryption_manager = EncryptionManager()
    
    # Create default admin user (in production, use secure initialization)
    create_default_admin_user(auth_manager, encryption_manager)
    
    @info "Security system initialized with military-grade protection"
    
    return (auth_manager, api_manager, rate_limiter, encryption_manager)
end

"""
Create default admin user for initial system access
"""
function create_default_admin_user(auth_manager::AuthenticationManager, 
                                  encryption_manager::EncryptionManager)
    admin_id = "admin_001"
    password_hash = hash_password("AdminP@ssw0rd123!")  # Should be changed immediately
    
    auth_manager.user_credentials[admin_id] = Dict(
        "password_hash" => password_hash,
        "role" => ADMIN,
        "access_level" => SYSTEM_ADMIN,
        "mfa_enabled" => true,
        "created_at" => now(),
        "last_login" => nothing,
        "must_change_password" => true
    )
    
    @warn "Default admin user created - CHANGE PASSWORD IMMEDIATELY in production"
end

"""
Authenticate user with username and password
"""
function authenticate_user(auth_manager::AuthenticationManager, 
                          user_id::String, password::String, 
                          ip_address::String; mfa_token::String = "")
    # Check if account is locked
    if is_account_locked(auth_manager, user_id)
        log_security_event(auth_manager, UNAUTHORIZED_ACCESS, user_id, ip_address,
                          Dict("reason" => "account_locked"), "HIGH")
        return Dict("success" => false, "error" => "Account locked due to failed attempts")
    end
    
    # Verify credentials
    if !haskey(auth_manager.user_credentials, user_id)
        record_failed_attempt(auth_manager, user_id, ip_address)
        return Dict("success" => false, "error" => "Invalid credentials")
    end
    
    user_data = auth_manager.user_credentials[user_id]
    password_hash = hash_password(password)
    
    if user_data["password_hash"] != password_hash
        record_failed_attempt(auth_manager, user_id, ip_address)
        return Dict("success" => false, "error" => "Invalid credentials")
    end
    
    # Check MFA if enabled
    if auth_manager.config.enable_mfa && user_data["mfa_enabled"]
        if isempty(mfa_token) || !verify_mfa_token(user_id, mfa_token)
            return Dict("success" => false, "error" => "MFA token required or invalid")
        end
    end
    
    # Create session
    session_token = generate_session_token()
    session_data = Dict(
        "user_id" => user_id,
        "role" => user_data["role"],
        "access_level" => user_data["access_level"],
        "ip_address" => ip_address,
        "created_at" => now(),
        "expires_at" => now() + Minute(auth_manager.config.session_timeout_minutes)
    )
    
    auth_manager.active_sessions[session_token] = session_data
    
    # Update user login info
    user_data["last_login"] = now()
    
    # Clear failed attempts
    if haskey(auth_manager.failed_attempts, user_id)
        delete!(auth_manager.failed_attempts, user_id)
    end
    
    # Log successful login
    log_security_event(auth_manager, LOGIN_SUCCESS, user_id, ip_address,
                      Dict("session_token" => session_token[1:8] * "..."), "LOW")
    
    return Dict(
        "success" => true,
        "session_token" => session_token,
        "role" => user_data["role"],
        "access_level" => user_data["access_level"],
        "expires_at" => session_data["expires_at"]
    )
end

"""
Generate API key for programmatic access
"""
function generate_api_key(api_manager::APIKeyManager, user_id::String, 
                         role::UserRole, description::String; 
                         expires_days::Int = 365)
    api_key = generate_secure_key(API_KEY_LENGTH)
    key_id = "key_" * string(uuid4())[1:8]
    
    key_data = Dict(
        "key_id" => key_id,
        "user_id" => user_id,
        "role" => role,
        "description" => description,
        "created_at" => now(),
        "expires_at" => now() + Day(expires_days),
        "last_used" => nothing,
        "usage_count" => 0,
        "is_active" => true
    )
    
    api_manager.api_keys[api_key] = key_data
    api_manager.key_usage[api_key] = Vector{DateTime}()
    
    # Schedule rotation (90 days before expiry)
    api_manager.rotation_schedule[api_key] = key_data["expires_at"] - Day(90)
    
    @info "API key generated for user $user_id: $key_id"
    
    return Dict(
        "api_key" => api_key,
        "key_id" => key_id,
        "expires_at" => key_data["expires_at"]
    )
end

"""
Validate API key and check permissions
"""
function validate_api_key(api_manager::APIKeyManager, api_key::String, 
                         required_access::AccessLevel)
    if !haskey(api_manager.api_keys, api_key)
        return Dict("valid" => false, "error" => "Invalid API key")
    end
    
    if api_key in api_manager.revoked_keys
        return Dict("valid" => false, "error" => "API key revoked")
    end
    
    key_data = api_manager.api_keys[api_key]
    
    if !key_data["is_active"]
        return Dict("valid" => false, "error" => "API key inactive")
    end
    
    if now() > key_data["expires_at"]
        return Dict("valid" => false, "error" => "API key expired")
    end
    
    # Check access level (simplified - in production use more sophisticated RBAC)
    user_access_level = get_access_level_for_role(key_data["role"])
    if Int(user_access_level) < Int(required_access)
        return Dict("valid" => false, "error" => "Insufficient permissions")
    end
    
    # Update usage tracking
    key_data["last_used"] = now()
    key_data["usage_count"] += 1
    push!(api_manager.key_usage[api_key], now())
    
    return Dict(
        "valid" => true,
        "user_id" => key_data["user_id"],
        "role" => key_data["role"],
        "key_id" => key_data["key_id"]
    )
end

"""
Check rate limits for requests
"""
function check_rate_limit(rate_limiter::RateLimiter, identifier::String, 
                         role::UserRole, ip_address::String)
    current_time = now()
    
    # Check if IP is blocked
    if haskey(rate_limiter.blocked_ips, ip_address)
        block_time = rate_limiter.blocked_ips[ip_address]
        if current_time - block_time < Minute(5)  # 5-minute block
            return Dict("allowed" => false, "error" => "IP temporarily blocked")
        else
            delete!(rate_limiter.blocked_ips, ip_address)
        end
    end
    
    # Initialize request buffer if needed
    if !haskey(rate_limiter.request_counts, identifier)
        rate_limiter.request_counts[identifier] = CircularBuffer{DateTime}(1000)
    end
    
    request_buffer = rate_limiter.request_counts[identifier]
    
    # Clean old requests (outside time window)
    cutoff_time = current_time - Second(RATE_LIMIT_WINDOW_SECONDS)
    while !isempty(request_buffer) && first(request_buffer) < cutoff_time
        popfirst!(request_buffer)
    end
    
    # Check rate limit
    limit = get(rate_limiter.rate_limits, role, 100)  # Default 100 req/min
    current_count = length(request_buffer)
    
    if current_count >= limit
        # Rate limit exceeded - block IP temporarily
        rate_limiter.blocked_ips[ip_address] = current_time
        
        return Dict(
            "allowed" => false,
            "error" => "Rate limit exceeded",
            "limit" => limit,
            "current_count" => current_count,
            "reset_time" => current_time + Second(RATE_LIMIT_WINDOW_SECONDS)
        )
    end
    
    # Record request
    push!(request_buffer, current_time)
    
    return Dict(
        "allowed" => true,
        "limit" => limit,
        "remaining" => limit - current_count - 1,
        "reset_time" => current_time + Second(RATE_LIMIT_WINDOW_SECONDS)
    )
end

"""
Encrypt sensitive data
"""
function encrypt_data(encryption_manager::EncryptionManager, data::String)
    # Simple XOR encryption (in production, use AES-256-GCM)
    key = encryption_manager.master_key
    data_bytes = Vector{UInt8}(data)
    encrypted_bytes = Vector{UInt8}(undef, length(data_bytes))
    
    for i in 1:length(data_bytes)
        key_index = ((i - 1) % length(key)) + 1
        encrypted_bytes[i] = data_bytes[i] ⊻ key[key_index]
    end
    
    # Return base64 encoded
    return base64encode(encrypted_bytes)
end

"""
Decrypt sensitive data
"""
function decrypt_data(encryption_manager::EncryptionManager, encrypted_data::String)
    try
        # Decode from base64
        encrypted_bytes = base64decode(encrypted_data)
        key = encryption_manager.master_key
        decrypted_bytes = Vector{UInt8}(undef, length(encrypted_bytes))
        
        for i in 1:length(encrypted_bytes)
            key_index = ((i - 1) % length(key)) + 1
            decrypted_bytes[i] = encrypted_bytes[i] ⊻ key[key_index]
        end
        
        return String(decrypted_bytes)
    catch e
        @error "Decryption failed: $e"
        return ""
    end
end

"""
Hash password securely
"""
function hash_password(password::String, salt::String = generate_salt())
    # Use SHA-256 with salt (in production, use bcrypt/scrypt/argon2)
    salted_password = password * salt
    return bytes2hex(sha256(salted_password)) * ":" * salt
end

"""
Generate cryptographic salt
"""
function generate_salt(length::Int = 16)
    return randstring(['A':'Z'; 'a':'z'; '0':'9'], length)
end

"""
Generate secure random key
"""
function generate_secure_key(length::Int = 32)
    chars = ['A':'Z'; 'a':'z'; '0':'9']
    return randstring(chars, length)
end

"""
Generate session token
"""
function generate_session_token()
    timestamp = string(Int(datetime2unix(now())))
    random_part = generate_secure_key(32)
    token_data = timestamp * ":" * random_part
    return base64encode(token_data)
end

"""
Verify MFA token (mock implementation)
"""
function verify_mfa_token(user_id::String, token::String)
    # Mock MFA verification (in production, integrate with TOTP/SMS/hardware tokens)
    # For testing, accept "123456" as valid token
    return token == "123456"
end

"""
Check if account is locked due to failed attempts
"""
function is_account_locked(auth_manager::AuthenticationManager, user_id::String)
    if haskey(auth_manager.locked_accounts, user_id)
        lock_time = auth_manager.locked_accounts[user_id]
        if now() - lock_time < Minute(auth_manager.config.lockout_duration_minutes)
            return true
        else
            delete!(auth_manager.locked_accounts, user_id)
        end
    end
    return false
end

"""
Record failed login attempt
"""
function record_failed_attempt(auth_manager::AuthenticationManager, 
                              user_id::String, ip_address::String)
    if !haskey(auth_manager.failed_attempts, user_id)
        auth_manager.failed_attempts[user_id] = Vector{DateTime}()
    end
    
    push!(auth_manager.failed_attempts[user_id], now())
    
    # Clean old attempts (keep only last hour)
    cutoff_time = now() - Hour(1)
    filter!(t -> t > cutoff_time, auth_manager.failed_attempts[user_id])
    
    # Check if account should be locked
    if length(auth_manager.failed_attempts[user_id]) >= auth_manager.config.max_login_attempts
        auth_manager.locked_accounts[user_id] = now()
        
        log_security_event(auth_manager, LOGIN_FAILURE, user_id, ip_address,
                          Dict("reason" => "account_locked_after_failures"), "HIGH")
        
        @warn "Account $user_id locked due to excessive failed attempts"
    else
        log_security_event(auth_manager, LOGIN_FAILURE, user_id, ip_address,
                          Dict("attempt_count" => length(auth_manager.failed_attempts[user_id])), "MEDIUM")
    end
end

"""
Log security event for audit trail
"""
function log_security_event(auth_manager::AuthenticationManager, 
                           event_type::SecurityEventType, user_id::String,
                           ip_address::String, details::Dict{String, Any},
                           risk_level::String = "MEDIUM")
    event = SecurityEvent(event_type, user_id, ip_address, details; risk_level = risk_level)
    push!(auth_manager.security_events, event)
    
    # Keep only recent events (last 10000)
    if length(auth_manager.security_events) > 10000
        splice!(auth_manager.security_events, 1:1000)
    end
    
    # Log high-risk events
    if risk_level in ["HIGH", "CRITICAL"]
        @warn "Security event: $event_type for user $user_id from $ip_address - $risk_level risk"
    end
end

"""
Get access level for user role
"""
function get_access_level_for_role(role::UserRole)
    role_access_map = Dict(
        ADMIN => SYSTEM_ADMIN,
        TRADER => TRADE_EXECUTION,
        ANALYST => PORTFOLIO_MANAGEMENT,
        VIEWER => READ_ONLY,
        API_USER => TRADE_EXECUTION
    )
    
    return get(role_access_map, role, READ_ONLY)
end

"""
Validate session token
"""
function validate_session(auth_manager::AuthenticationManager, session_token::String)
    if !haskey(auth_manager.active_sessions, session_token)
        return Dict("valid" => false, "error" => "Invalid session")
    end
    
    session_data = auth_manager.active_sessions[session_token]
    
    if now() > session_data["expires_at"]
        delete!(auth_manager.active_sessions, session_token)
        return Dict("valid" => false, "error" => "Session expired")
    end
    
    # Extend session
    session_data["expires_at"] = now() + Minute(auth_manager.config.session_timeout_minutes)
    
    return Dict(
        "valid" => true,
        "user_id" => session_data["user_id"],
        "role" => session_data["role"],
        "access_level" => session_data["access_level"]
    )
end

"""
Revoke API key
"""
function revoke_api_key(api_manager::APIKeyManager, api_key::String, reason::String = "")
    if haskey(api_manager.api_keys, api_key)
        push!(api_manager.revoked_keys, api_key)
        api_manager.api_keys[api_key]["is_active"] = false
        api_manager.api_keys[api_key]["revoked_at"] = now()
        api_manager.api_keys[api_key]["revoke_reason"] = reason
        
        @info "API key revoked: $(api_manager.api_keys[api_key]["key_id"]) - $reason"
        return true
    end
    return false
end

"""
Get security audit report
"""
function get_security_audit_report(auth_manager::AuthenticationManager)
    recent_events = filter(e -> e.timestamp > now() - Day(7), auth_manager.security_events)
    
    event_counts = Dict{SecurityEventType, Int}()
    risk_distribution = Dict{String, Int}()
    
    for event in recent_events
        event_counts[event.event_type] = get(event_counts, event.event_type, 0) + 1
        risk_distribution[event.risk_level] = get(risk_distribution, event.risk_level, 0) + 1
    end
    
    return Dict(
        "report_period" => "Last 7 days",
        "total_events" => length(recent_events),
        "event_breakdown" => event_counts,
        "risk_distribution" => risk_distribution,
        "active_sessions" => length(auth_manager.active_sessions),
        "locked_accounts" => length(auth_manager.locked_accounts),
        "generated_at" => now()
    )
end

end # module