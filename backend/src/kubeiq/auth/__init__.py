"""Sign-in, users, projects and access checks (ADR 0008).

The built-in admin signs in with the master key (like LiteLLM). Other users have passwords and
get access to clusters and namespaces through projects, as viewer or editor.
"""
