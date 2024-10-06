const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');
const { MongoClient, ObjectId } = require('mongodb');

const app = new Koa();
const router = new Router();

const url = 'mongodb://localhost:27017';
const dbName = 'todosDB';
let db, todosCollection, tagsCollection;

//connect to mongoDB
async function connectToDatabase() {
    const client = new MongoClient(url);
    try {
        await client.connect();
        db = client.db(dbName);
        todosCollection = db.collection('todos');
        tagsCollection = db.collection('tags');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
}

connectToDatabase();

//swagger setup
let swaggerSpec;

(async () => {
    try {
        const fileContent = await fs.readFile(path.resolve(__dirname, 'swagger_todos_v1.yaml'), 'utf8');
        swaggerSpec = yaml.load(fileContent);
        console.log('Swagger spec loaded successfully.');
    } catch (error) {
        console.error('Failed to load Swagger spec:', error);
    }
})();

//routes for todo
router.get('/todos/', fetchTodos)
    .del('/todos/', resetTodos)
    .post('/todos/', createTodo)
    .get('/todos/:id', getTodo)
    .patch('/todos/:id', modifyTodo)
    .del('/todos/:id', deleteTodo)
    .post('/todos/:id/tags/', assignTagToTodo)
    .get('/todos/:id/tags/', fetchTodoTags)
    .del('/todos/:id/tags/', clearTodoTags)
    .del('/todos/:id/tags/:tagId', detachTagFromTodo);

//routes for tag 
router.get('/tags/', fetchTags)
    .del('/tags/', resetTags)
    .post('/tags/', createTag)
    .get('/tags/:id', getTag)
    .patch('/tags/:id', modifyTag)
    .del('/tags/:id', deleteTag)
    .get('/tags/:id/todos/', fetchTagTodos);

//handlers for todo operations
async function fetchTodos(ctx) {
    const todos = await todosCollection.find({}).toArray();
    ctx.body = todos.map(todo => ({
        ...todo,
        id: todo._id,
        url: `http://${ctx.host}/todos/${todo._id}`
    }));
}

async function resetTodos(ctx) {
    await todosCollection.deleteMany({});
    ctx.status = 204;
}

async function createTodo(ctx) {
    const todo = ctx.request.body;

    todo.completed = todo.completed || false;
    todo.tags = todo.tags || [];

    const result = await todosCollection.insertOne(todo);
    todo.id = result.insertedId;

    //updating existant taga
    if (todo.tags.length > 0) {
        const tagIds = todo.tags.map(tagId => new ObjectId(tagId));

        await todosCollection.updateOne(
            { _id: todo.id },
            { $set: { tags: tagIds } }
        );

        await tagsCollection.updateMany(
            { _id: { $in: tagIds } },
            { $addToSet: { todos: todo.id } }
        );
    }

    const updatedTodo = await todosCollection.findOne({ _id: todo.id });
    const tags = await tagsCollection.find({ _id: { $in: updatedTodo.tags || [] } }).toArray();
    updatedTodo.tags = tags.map(tag => ({ id: tag._id, title: tag.title }));

    ctx.status = 201;
    ctx.body = {
        ...updatedTodo,
        id: updatedTodo._id,
        url: `http://${ctx.host}/todos/${updatedTodo._id}`
    };

    delete ctx.body._id;
}



async function getTodo(ctx) {
    const id = ctx.params.id;
    const todo = await todosCollection.findOne({ _id: new ObjectId(id) });

    //fetch tags asociated with ids
    const tags = await tagsCollection.find({ _id: { $in: todo.tags || [] } }).toArray();
    todo.tags = tags.map(tag => ({ id: tag._id, title: tag.title }));

    ctx.body = {
        ...todo,
        id: todo._id
    };

    delete ctx.body._id;
}


async function modifyTodo(ctx) {
    const id = ctx.params.id;
    let objectId;

    objectId = new ObjectId(id);

    const existingTodo = await todosCollection.findOne({ _id: objectId });
    const updatedFields = ctx.request.body;

    //update in mongoDb
    const updateResult = await todosCollection.updateOne(
        { _id: objectId },
        { $set: updatedFields }
    );

    //refetch
    const updatedTodo = await todosCollection.findOne({ _id: objectId });

    const tags = await tagsCollection.find({ _id: { $in: updatedTodo.tags || [] } }).toArray();
    updatedTodo.tags = tags.map(tag => ({ id: tag._id, ...tag }));

    ctx.body = {
        ...updatedTodo,
        id: updatedTodo._id,
        url: `http://${ctx.host}/todos/${updatedTodo._id}`
    };
    ctx.status = 200;
}



async function deleteTodo(ctx) {
    const id = ctx.params.id;
    const result = await todosCollection.findOneAndDelete({ _id: new ObjectId(id) });

    //remove todo from all tags
    await tagsCollection.updateMany({}, { $pull: { todos: new ObjectId(id) } });

    ctx.status = 204;
}

//handlers for tag operations
async function fetchTags(ctx) {
    const tags = await tagsCollection.find({}).toArray();
    ctx.body = tags.map(tag => ({
        ...tag,
        id: tag._id,
        url: `http://${ctx.host}/tags/${tag._id}`
    }));
}

async function resetTags(ctx) {
    await tagsCollection.deleteMany({});
    ctx.status = 204;
}

async function createTag(ctx) {
    const tag = ctx.request.body;

    tag.todos = [];

    const result = await tagsCollection.insertOne(tag);
    tag.id = result.insertedId;

    ctx.status = 201;
    ctx.body = { ...tag, url: `http://${ctx.host}/tags/${tag.id}` };
}

async function getTag(ctx) {
    const id = ctx.params.id;
    const tag = await tagsCollection.findOne({ _id: new ObjectId(id) });

    ctx.body = { ...tag, id: tag._id };
}

async function modifyTag(ctx) {
    const id = ctx.params.id;
    let objectId;

    objectId = new ObjectId(id);
    const updates = ctx.request.body;

    const updateResult = await tagsCollection.updateOne(
        { _id: objectId },
        { $set: updates }
    );

    // Re-fetch updated tag
    const updatedTag = await tagsCollection.findOne({ _id: objectId });

    ctx.body = {
        ...updatedTag,
        id: updatedTag._id,
        url: `http://${ctx.host}/tags/${updatedTag._id}`
    };
    ctx.status = 200;
}


async function deleteTag(ctx) {
    const id = ctx.params.id;
    const result = await tagsCollection.findOneAndDelete({ _id: new ObjectId(id) });

    await todosCollection.updateMany({}, { $pull: { tags: new ObjectId(id) } });
    ctx.status = 204;
}

// ------- Handlers for Many-to-Many Associations -------
async function assignTagToTodo(ctx) {
    const todoId = new ObjectId(ctx.params.id);
    const tagId = new ObjectId(ctx.request.body.id);

    const todo = await todosCollection.findOne({ _id: todoId });
    const tag = await tagsCollection.findOne({ _id: tagId });

    await todosCollection.updateOne({ _id: todoId }, { $addToSet: { tags: tagId } });
    await tagsCollection.updateOne({ _id: tagId }, { $addToSet: { todos: todoId } });

    ctx.status = 201;
    ctx.body = { id: tagId, ...tag };
}

async function fetchTodoTags(ctx) {
    const todoId = new ObjectId(ctx.params.id);
    const todo = await todosCollection.findOne({ _id: todoId });

    const tags = await tagsCollection.find({ _id: { $in: todo.tags || [] } }).toArray();
    ctx.body = tags.map(tag => ({ ...tag, id: tag._id }));
}

async function clearTodoTags(ctx) {
    const todoId = new ObjectId(ctx.params.id);
    const todo = await todosCollection.findOne({ _id: todoId });

    await tagsCollection.updateMany({ _id: { $in: todo.tags || [] } }, { $pull: { todos: todoId } });
    await todosCollection.updateOne({ _id: todoId }, { $set: { tags: [] } });

    ctx.status = 204;
}

async function detachTagFromTodo(ctx) {
    const todoId = new ObjectId(ctx.params.id);
    const tagId = new ObjectId(ctx.params.tagId);

    const todo = await todosCollection.findOne({ _id: todoId });
    const tag = await tagsCollection.findOne({ _id: tagId });

    await todosCollection.updateOne({ _id: todoId }, { $pull: { tags: tagId } });
    await tagsCollection.updateOne({ _id: tagId }, { $pull: { todos: todoId } });

    ctx.status = 204;
}

async function fetchTagTodos(ctx) {
    const tagId = new ObjectId(ctx.params.id);
    const tag = await tagsCollection.findOne({ _id: tagId });

    const todos = await todosCollection.find({ _id: { $in: tag.todos || [] } }).toArray();
    ctx.body = todos.map(todo => ({
        ...todo,
        id: todo._id,
        url: `http://${ctx.host}/todos/${todo._id}`
    }));
}

//server setup
app
    .use(bodyParser())
    .use(cors())
    .use(router.routes())
    .use(router.allowedMethods());

//Swagger - waits until is loaded
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        ctx.status = err.status || 500;
        ctx.body = { error: err.message };
        ctx.set('Content-Type', 'application/json');
        ctx.app.emit('error', err, ctx);
    }
});


//start server on port 8080
app.listen(8080, () => {
    console.log('Server is running at http://localhost:8080');
});

