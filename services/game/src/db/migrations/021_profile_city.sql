ALTER TABLE profiles ADD COLUMN city text CHECK (city IS NULL OR char_length(city) BETWEEN 1 AND 60);
