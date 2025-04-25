module Storage

export Store, FileStore, put!, get, delete!, keys

"""
    Store{K,V}()

An in-memory key/value store.
"""
struct Store{K,V}
    data::Dict{K,V}
    Store{K,V}() where {K,V} = new(Dict{K,V}())
end

"""
    put!(s::Store, key::K, value::V)

Store `value` under `key` in-memory.
"""
function put!(s::Store{K,V}, key::K, value::V) where {K,V}
    s.data[key] = value
    return true
end

"""
    get(s::Store, key::K) -> V

Retrieve value for `key`. Throws `KeyError` if missing.
"""
function get(s::Store{K,V}, key::K) where {K,V}
    return s.data[key]
end

"""
    delete!(s::Store, key::K)

Remove `key` from store. No-op if key not present.
"""
function delete!(s::Store{K,V}, key::K) where {K,V}
    pop!(s.data, key, nothing)
    return true
end

"""
    keys(s::Store) -> Vector{K}

Return all keys in the store.
"""
keys(s::Store{K,V}) where {K,V} = collect(keys(s.data))

# -- File-backed store stub --

export FileStore

"""
    FileStore(path::AbstractString)

A stub for a file-based store rooted at `path`.
"""
struct FileStore
    root::String
    FileStore(path::AbstractString) = new(path)
end

"""
    put!(fs::FileStore, key::String, value::AbstractString)

(Stub) Write `value` to file at `fs.root/key`.
"""
function put!(fs::FileStore, key::String, value::AbstractString)
    # Dummy implementation: just print action
    @info "Writing to file" path=joinpath(fs.root, key)
    return true
end

"""
    get(fs::FileStore, key::String) -> String

(Stub) Read contents of file at `fs.root/key`.
"""
function get(fs::FileStore, key::String)
    @info "Reading from file" path=joinpath(fs.root, key)
    return "dummy content"
end

"""
    delete!(fs::FileStore, key::String)

(Stub) Delete file at `fs.root/key`.
"""
function delete!(fs::FileStore, key::String)
    @info "Deleting file" path=joinpath(fs.root, key)
    return true
end

end # module