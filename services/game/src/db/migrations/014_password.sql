-- Inscription par e-mail et mot de passe (plus de compte invité). Empreinte scrypt, jamais le mot de passe lui-même.
ALTER TABLE users ADD COLUMN password_hash text;
CREATE UNIQUE INDEX users_email_lower ON users (lower(email));
