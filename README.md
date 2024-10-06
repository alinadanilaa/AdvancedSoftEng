# todo-backend-node-koa

## A todo backend app using Node.js with Koa, MongoDB and Swagger

The project allows users to manage Todos and Tags. In this app you can create, update, delete tags and todos, and manage them in a many-to-many relationship.

## To run this project you need:
- [Node.js](https://nodejs.org/en)
- [MongoDB](https://www.mongodb.com/try/download/community)

## Usage:

#### 1. Extract the folder from the zip 
#### 2. Install dependencies
```
npm install
```
#### 3. Run MongoDB locally on your system
By default, the project is using ```mongodb://localhost:27017``` and the database name ```todosDB```. If using another setup, modify the connection URL in the code (lines 13 and 14):
```
const url = 'mongodb://localhost:27017';
const dbName = 'todosDB';
```
#### 4. Run the server after everything above is set up
```
node index.js
```

## Tests

You can run validate the application with https://todospecs.thing.zone/index.html?http://localhost:8080
