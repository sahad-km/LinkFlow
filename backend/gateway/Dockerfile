# 1. Use lightweight Alpine image (~150MB instead of 1.1GB)
FROM node:20-alpine

# 2. Set working directory
WORKDIR /app

# 3. Copy package definitions first for Docker layer caching
COPY package*.json ./

# 4. Install production dependencies
RUN npm install

# 5. Copy the application source code (index.js, etc.)
COPY . .

# 6. Expose the port
EXPOSE 8000

# 7. Start the application
CMD ["npm", "start"]
