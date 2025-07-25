require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const nodemailer = require("nodemailer");
const port = process.env.PORT || 5000;
const app = express();

// Middleware setup
const corsOptions = {
  origin: ['http://localhost:5173', 'https://gadgetz-world-360f2.web.app', 'https://gadgetz-world-360f2.firebaseapp.com'],
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
//send email using nodemailer
const sendEmail = (emailAddress, emailData) => {
  // create transporter
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for port 465, false for other ports
    auth: {
      user: process.env.NODEMAILER_USER,
      pass: process.env.NODEMAILER_PASS,
    },
  });
  // verify connection
  transporter.verify((error, success) => {
    if (error) {
      console.log(error)
    } else {
      // console.log('Transporter is ready to emails', success)
    }
  })
  //  transporter.sendMail()
  const mailBody = {
    from: process.env.NODEMAILER_USER, // sender address
    to: emailAddress, // list of receivers
    subject: emailData?.subject,
    // text: emailData?.message, // plain text body
    html: `<p>${emailData?.message}</p>`, // html body
  }
  // send email
  transporter.sendMail(mailBody, (error, info) => {
    if (error) {
      console.log(error)
    } else {
      // console.log(info)
      console('Email Sent: ' + info?.response)
    }

  })
}

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
    // await client.connect();
    console.log('Connected to MongoDB');

    // Assign collection after connect
    userCollection = client.db('GadgetzWorld-client').collection('users');
    ProductCollection = client.db('GadgetzWorld-client').collection('products');
    wishlistCollection = client.db('GadgetzWorld-client').collection('wishlist');
    orderCollection = client.db('GadgetzWorld-client').collection('orders');
    BannerCollection = client.db('GadgetzWorld-client').collection('banners');
    MarqueeCollection = client.db('GadgetzWorld-client').collection('marquee');

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

    // get all user data
    app.get('/all-users/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      const query = { email: { $ne: email } }
      const result = await userCollection.find(query).toArray()
      res.send(result)
    })

    app.delete("/user/:id", async (req, res) => {
      const userId = req.params.id;

      if (!ObjectId.isValid(userId)) {
        return res.status(400).send({ error: "Invalid user ID" });
      }

      try {
        const result = await userCollection.deleteOne({ _id: new ObjectId(userId) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "User not found" });
        }

        res.send({ success: true, deletedCount: result.deletedCount });
      } catch (error) {
        console.error("Failed to delete user:", error);
        res.status(500).send({ error: "Server error" });
      }
    });






    // product ----------------------------->
    //  get inventory data for  seller
    app.get('/products/seller', verifyToken, async (req, res) => {
      const email = req.user.email
      const result = await ProductCollection.find({ 'seller.email': email }).toArray()
      res.send(result)
    })
    // delete a product from db by seller
    app.delete('/products/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await ProductCollection.deleteOne(query)
      res.send(result)
    })

    app.put("/products/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const updatedProduct = req.body;

      const filter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          productName: updatedProduct.productName,
          description: updatedProduct.description,
          price: updatedProduct.price,
          discount: updatedProduct.discount,
          totalPrice: updatedProduct.totalPrice,
          quantity: updatedProduct.quantity,
          bkashNumber: updatedProduct.bkashNumber,
          nagadNumber: updatedProduct.nagadNumber,
          category: updatedProduct.category,
          images: updatedProduct.images,
          seller: updatedProduct.seller,
          createdAt: updatedProduct.createdAt,
        },
      };

      try {
        const result = await ProductCollection.updateOne(filter, updatedDoc);

        if (result.modifiedCount > 0) {
          res.status(200).json({ message: "✅ Product updated successfully!" });
        } else {
          res.status(400).json({ message: "No changes made to the product." });
        }
      } catch (error) {
        console.error("❌ Error updating product:", error);
        res
          .status(500)
          .json({ message: "An error occurred while updating the product." });
      }
    });




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
 /

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
    

     // / get all product data in db
    app.get('/allWishlist',verifyToken, async (req, res) => {
      const result = await wishlistCollection.find().toArray()
      res.send(result)
    })

    // Order Collection---------------------->

    app.post('/orders', verifyToken, async (req, res) => {
      const product = req.body;
      try {
        const result = await orderCollection.insertOne(product);

        if (result?.insertedId) {
          const orderInfo = product;

          // ✅ Email to Customer
          const customerEmailData = {
            subject: "✅ Order Placed Successfully - Gadget'z World",
            message: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #1a73e8;">Hi ${orderInfo.customer?.name || "Customer"},</h2>
            <p>Thank you for shopping with <strong>Gadget'z World</strong>! 🎉</p>
            
            <h3 style="color: #4caf50;">🧾 Order Summary</h3>
            <ul>
              <li><strong>Product:</strong> ${orderInfo.productName}</li>
              <li><strong>Quantity:</strong> ${orderInfo.quantity}</li>
              <li><strong>Total Price:</strong> <span style="color: #d32f2f;">৳${orderInfo.totalPrice}</span></li>
              <li><strong>Payment Method:</strong> ${orderInfo.paymentMethod}</li>
              <li><strong>Transaction ID:</strong> ${orderInfo.transactionId}</li>
              <li><strong>Order Date:</strong> ${orderInfo.orderDate}</li>
            </ul>

            <h3 style="color: #4caf50;">📦 Shipping Address</h3>
            <p>
              ${orderInfo.customer.fullAddress}<br/>
              ${orderInfo.customer.thana}, ${orderInfo.customer.district}<br/>
              Phone: ${orderInfo.customer.phone}
            </p>

            <p>We will contact you soon to confirm delivery. If you have any questions, feel free to reply to this email.</p>

            <p style="margin-top: 30px;">Warm regards,<br/><strong>Gadget'z World Team</strong></p>
          </div>
        `,
          };
          await sendEmail(orderInfo.customer.email, customerEmailData);

          // ✅ Email to Seller
          const sellerEmailData = {
            subject: "📦 New Order Alert - Gadget'z World",
            message: `
          <div style="font-family: Arial, sans-serif; color: #333;">
            <h2 style="color: #e65100;">New Order Received!</h2>
            <p>You have received a new order from <strong>${orderInfo.customer.name}</strong> (${orderInfo.customer.email}).</p>

            <h3 style="color: #4caf50;">🛒 Product Details</h3>
            <ul>
              <li><strong>Product:</strong> ${orderInfo.productName}</li>
              <li><strong>Quantity:</strong> ${orderInfo.quantity}</li>
              <li><strong>Total Price:</strong> <span style="color: #d32f2f;">৳${orderInfo.totalPrice}</span></li>
              <li><strong>Order Date:</strong> ${orderInfo.orderDate}</li>
            </ul>

            <h3 style="color: #4caf50;">📍 Shipping Info</h3>
            <p>
              ${orderInfo.customer.fullAddress}<br/>
              ${orderInfo.customer.thana}, ${orderInfo.customer.district}<br/>
              Phone: ${orderInfo.customer.phone}
            </p>

            <p><strong>Payment Method:</strong> ${orderInfo.paymentMethod}<br/>
            <strong>Transaction ID:</strong> ${orderInfo.transactionId}</p>

            <p>Please process the order as soon as possible to ensure timely delivery.</p>

            <p style="margin-top: 30px;">Regards,<br/><strong>Gadget'z World System</strong></p>
          </div>
        `,
          };
          await sendEmail(orderInfo.seller, sellerEmailData);
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: 'Failed to create order' });
      }
    });
    app.patch('/products/quantity/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { quantityToUpdate, status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid ID" });
      }

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $inc: {
          quantity: status === 'increase' ? quantityToUpdate : -quantityToUpdate
        }
      };

      try {
        const result = await ProductCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).send({ error: "Quantity update failed." });
      }
    });
    // get all orders data in db
    app.get('/orders', verifyToken, async (req, res) => {
      const result = await orderCollection.find().toArray()
      res.send(result)
    })
    // get a order by id
    app.get('/orders/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await orderCollection.findOne(query)
      res.send(result)
    })
    // update a order status
    app.patch('/update-order-status/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;

      try {
        // অর্ডার খুঁজে বের করা
        const orderInfo = await orderCollection.findOne({ _id: new ObjectId(id) });

        if (!orderInfo) {
          return res.status(404).send({ message: 'Order not found' });
        }

        // আগের স্ট্যাটাসের সাথে নতুন স্ট্যাটাস এক হলে কিছু করার দরকার নেই
        if (orderInfo.status === status) {
          return res.status(400).send({ message: 'Order status is already updated' });
        }

        // নতুন স্ট্যাটাস সেট করা
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount > 0) {

          return res.send({ message: 'Order status updated successfully', modifiedCount: result.modifiedCount });
        } else {
          return res.status(500).send({ message: 'Failed to update order status' });
        }

      } catch (error) {
        console.error('Error updating order status:', error);
        return res.status(500).send({ message: 'Server error' });
      }
    });
    // Cancel Order
    app.delete('/orders/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      try {
        const order = await orderCollection.findOne(query);

        if (!order) {
          return res.status(404).send({ message: "Order not found" });
        }

        if (order.status === 'Delivered') {
          return res.status(409).send({ message: "Cannot cancel once the product is delivered" });
        }

        const result = await orderCollection.deleteOne(query);
        res.send({
          message: "Order cancelled successfully",
          deletedCount: result.deletedCount
        });

      } catch (error) {
        console.error("Error cancelling order:", error);
        res.status(500).send({ message: "Server error while cancelling order" });
      }
    });


    // get order customer
    app.get('/customer-orders/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;
        const query = { 'customer.email': email };
        const orders = await orderCollection.find(query).toArray();

        res.send(orders);
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch customer orders" });
      }
    });
    app.get('/admin-stat', verifyToken, async (req, res) => {
      try {
        const totalUsers = await userCollection.estimatedDocumentCount();
        const totalProducts = await ProductCollection.estimatedDocumentCount();
        const totalOrders = await orderCollection.estimatedDocumentCount();
        const totalWishlist = await wishlistCollection.estimatedDocumentCount();
        const totalMarquee = await MarqueeCollection.estimatedDocumentCount();
        const totalBanner = await BannerCollection.estimatedDocumentCount();

        // আজকের তারিখ 0:00 থেকে
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29); // ৩০ দিনের জন্য

        // ৩০ দিনের তারিখের লিস্ট
        const dateList = Array.from({ length: 30 }, (_, i) => {
          const d = new Date(thirtyDaysAgo);
          d.setDate(d.getDate() + i);
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const yyyy = d.getFullYear();
          return `${dd}/${mm}/${yyyy}`;
        });

        const todayStr = dateList[29];

        // আজকের completed অর্ডার
        const todayCompletedOrders = await orderCollection.find({
          orderDate: { $regex: `^${todayStr}` },
          status: "completed",
        }).toArray();

        const todayTotalSell = todayCompletedOrders.reduce(
          (sum, order) => sum + (order.totalPrice || 0),
          0
        );

        // সব সময়ের completed অর্ডার
        const allCompletedOrders = await orderCollection.find({ status: "completed" }).toArray();

        const overallTotalSell = allCompletedOrders.reduce(
          (sum, order) => sum + (order.totalPrice || 0),
          0
        );

        // ৩০ দিনের অর্ডার ও বিক্রয়
        const ordersLast30Days = await orderCollection.aggregate([
          {
            $match: {
              orderDate: {
                $regex: `^(${dateList.join('|')})`
              }
            }
          },
          {
            $project: {
              dateOnly: { $substr: ["$orderDate", 0, 10] },
              totalPrice: 1
            }
          },
          {
            $group: {
              _id: "$dateOnly",
              count: { $sum: 1 },
              totalSell: { $sum: "$totalPrice" }
            }
          },
          {
            $sort: { _id: 1 }
          }
        ]).toArray();

        let orderCounts = {};
        let sellCounts = {};

        dateList.forEach(date => {
          orderCounts[date] = 0;
          sellCounts[date] = 0;
        });

        ordersLast30Days.forEach(item => {
          orderCounts[item._id] = item.count;
          sellCounts[item._id] = item.totalSell;
        });

        // সর্বোচ্চ ডিসকাউন্ট ক্যাটেগরি
        const topDiscountCategoryAgg = await ProductCollection.aggregate([
          {
            $match: {
              discount: { $gt: 0 }
            }
          },
          {
            $group: {
              _id: "$category",
              count: { $sum: 1 }
            }
          },
          {
            $sort: { count: -1 }
          },
          {
            $limit: 1
          }
        ]).toArray();

        const topDiscountCategory = topDiscountCategoryAgg[0]?._id || "N/A";
        const discountedItemsCount = topDiscountCategoryAgg[0]?.count || 0;

        // মোট ডিসকাউন্ট প্রোডাক্ট
        const totalDiscountItems = await ProductCollection.countDocuments({
          discount: { $gt: 0 }
        });

        // রেসপন্স পাঠাও
        res.send({
          totalUsers,
          totalProducts,
          totalOrders,
          totalWishlist,
          orderCounts,
          sellCounts,
          todayTotalSell,
          overallTotalSell,
          topDiscountCategory,
          discountedItemsCount,
          totalDiscountItems,
          totalMarquee,
          totalBanner
        });

      } catch (error) {
        console.error("Admin stat error:", error);
        res.status(500).send({ message: "Something went wrong!" });
      }
    });



    // -------------->banners
    app.post('/banners', verifyToken, async (req, res) => {
      const banner = req.body;
      const result = await BannerCollection.insertOne(banner)
      res.send(result)
    })

    app.get('/banners', async (req, res) => {
      const result = await BannerCollection.find().toArray()
      res.send(result)
    })
    app.get('/banners/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await BannerCollection.findOne(query)
      res.send(result)
    })

    app.delete('/banners/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await BannerCollection.deleteOne(query);
      res.send(result);
    });


    // marquee---------------------------->

    app.post('/marquee', verifyToken, async (req, res) => {
      const product = req.body;
      const result = await MarqueeCollection.insertOne(product)
      res.send(result)
    })
    app.get('/marquee', async (req, res) => {
      const result = await MarqueeCollection.find().toArray()
      res.send(result)
    })
    app.get('/marquee/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await MarqueeCollection.findOne(query)
      res.send(result)
    })

    app.delete('/marquee/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await MarqueeCollection.deleteOne(query);
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
