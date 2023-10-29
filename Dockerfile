
# Use an official Node runtime as the parent image
FROM node:16-alpine


# Set the working directory in the container to /app
WORKDIR /app

# Copy package.json and package-lock.json to the container`
COPY package*.json ./

# install python for yt dl exec and then make sym link
RUN apk add --no-cache python3 make g++ gcc ffmpeg && \
    if [ ! -e /usr/bin/python ]; then ln -sf python3 /usr/bin/python; fi
# RUN ln -s /usr/bin/python3 /usr/local/bin/python

# Install project dependencies inside the container
# RUN npm install

RUN npm install sqlite3 -g
# RUN npm update
RUN npm install


# Copy the current directory contents into the container at /app
COPY . .

# Make the container's port 3000 available to the outside world
EXPOSE 3001

# Run the app when the container is started
CMD ["node", "server.js"]
 