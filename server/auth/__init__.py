"""Autenticacion local del unico usuario: configuracion, tokens y middleware.

No hay tabla de usuarios ni registro: la contrasena sale de
server/auth/password.hash y la allowlist de dispositivos de
server/auth/device.json. El resto del paquete solo firma y valida JWT.
"""
