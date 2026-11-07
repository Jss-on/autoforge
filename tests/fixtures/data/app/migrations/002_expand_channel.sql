-- expand: a nullable column with a default; old code keeps writing sales without it
ALTER TABLE sales ADD COLUMN channel TEXT DEFAULT 'counter';
