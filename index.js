require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');

const port = process.env.PORT || 5000;
const app = express();

// Middleware setup
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error(err);
      return res.status(401).send({ message: 'unauthorized access' });
    }
    req.user = decoded;
    next();
  });
};

// MongoDB client setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.nnldx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Declare userCollection here (without assignment)
let userCollection;

async function startServer() {
  try {
    // Connect client
    await client.connect();
    console.log('Connected to MongoDB');

    // Assign collection after connect
    userCollection = client.db('GadgetzWorld-client').collection('users');
    ProductCollection = client.db('GadgetzWorld-client').collection('products');
    wishlistCollection = client.db('GadgetzWorld-client').collection('wishlist');
    cartCollection = client.db('GadgetzWorld-client').collection('carts');
    orderCollection = client.db('GadgetzWorld-client').collection('orders');

    // Routes

    // Create JWT token and set cookie
    app.post('/jwt', (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d',
      });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Logout route clears cookie
    app.get('/logout', (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true });
      } catch (err) {
        res.status(500).send(err);
      }
    });
    // User------------------------------------>
    // Add new user if not exists
    app.post('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = req.body;

      try {
        const isExist = await userCollection.findOne(query);
        if (isExist) {
          return res.send(isExist);
        }
        const result = await userCollection.insertOne({
          ...user,
          role: 'customer',
          timestamp: Date.now(),
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: err.message });
      }
    });

    // get user role
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email
      const result = await userCollection.findOne({ email })
      res.send({ role: result?.role })
    })





    // product ----------------------------->
    app.post('/products', verifyToken, async (req, res) => {
      const product = req.body;
      const result = await ProductCollection.insertOne(product)
      res.send(result)
    })

    // get all product data in db
    app.get('/products', async (req, res) => {
      const result = await ProductCollection.find().toArray()
      res.send(result)
    })
    // get a product by id
    app.get('/product/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await ProductCollection.findOne(query)
      res.send(result)
    })



    // Wishlist------------------------>

    app.post('/wishlist', async (req, res) => {
      const product = req.body;
      const result = await wishlistCollection.insertOne(product)
      res.send(result)
    })

    app.get('/wishlist', async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        const result = await wishlistCollection.find({ "user.email": email }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching wishlist:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete('/wishlist', async (req, res) => {
      const { productId, email } = req.body;
      if (!productId || !email) {
        return res.status(400).send({ message: "Product ID and email are required" });
      }
      try {
        const result = await wishlistCollection.deleteOne({
          "product._id": productId,
          "user.email": email,
        });
        if (result.deletedCount > 0) {
          res.send({ message: "Wishlist item removed" });
        } else {
          res.status(404).send({ message: "Wishlist item not found" });
        }
      } catch (error) {
        console.error("Error deleting wishlist item:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    // Add to cart -------------------------->

    app.post('/carts', async (req, res) => {
      const product = req.body;
      const result = await cartCollection.insertOne(product)
      res.send(result)
    })
    app.get('/carts', async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({ message: "Email query is required" });
      }

      try {
        const result = await cartCollection.find({ userEmail: email }).toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;

      if (!id) {
        return res.status(400).send({ message: "Cart item ID is required" });
      }

      try {
        const result = await cartCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount > 0) {
          res.send({ deletedCount: result.deletedCount, message: "Cart item removed" });
        } else {
          res.status(404).send({ message: "Cart item not found" });
        }
      } catch (error) {
        console.error("Error deleting cart item:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.patch('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const { quantity } = req.body;

      if (quantity < 1) {
        return res.status(400).send({ message: "Quantity must be at least 1" });
      }

      try {
        const result = await cartCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { quantity: quantity } }
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating quantity:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    // Order Collection---------------------->

app.post('/orders', verifyToken, async (req, res) => {
  const product = req.body;
  // Create a formatted date string in DD-MM-YYYY
  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-GB'); // eg. "10/07/2025"
  product.orderDate = formattedDate; // add formatted date
  const result = await orderCollection.insertOne(product);
  res.send(result);
});






    // 
    // Simple health check
    app.get('/', (req, res) => {
      res.send('gadgetzworld is running');
    });

    // Start listening
    app.listen(port, () => {
      console.log(`gadgetzworld is running on port ${port}`);
    });

  } catch (error) {
    console.error('Error starting server:', error);
  }
}

startServer();
