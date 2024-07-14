// Load environment variables
require('dotenv').config();

// Required modules
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const session = require('express-session');
const bodyParser = require('body-parser');
const axios = require('axios');

// Initialize the app
const app = express();

// Models
const User = require('./model/registerModal');
const addUser = require('./model/addUserModal');
const profile = require('./model/profilemodel');
const transaction = require('./model/transaction');

// Middleware setup
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
  secret: 'abcd',
  resave: true,
  saveUninitialized: true
}));

// Database connection
const mongoURI = 'mongodb://localhost:27017/backend'; // Replace with your actual MongoDB URI
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('MongoDB connected');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Image upload setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './uploads');
  },
  filename: function (req, file, cb) {
    cb(null, file.fieldname + "_" + Date.now() + "_" + file.originalname);
  }
});
const uploader = multer({ storage: storage });

// Routes

// Home route
app.get('/', (req, res) => {
  const isLoggedIn = req.session.user ? true : false;
  res.render('home', { isLoggedIn });
});

// About route
app.get('/about', (req, res) => {
  res.render('about');
});

// Contact route
app.get('/contact', (req, res) => {
  res.render('contact');
});

// Register route
app.post('/register', async (req, res) => {
  try {
    const salt = await bcrypt.genSalt(10);
    const hashPass = await bcrypt.hash(req.body.password, salt);

    const newUser = new User({
      name: req.body.name,
      email: req.body.email,
      password: hashPass,
      phone: req.body.phone,
      contract: req.body.contract,
      Wallet: req.body.Wallet,
      metaWallet: req.body.metaWallet
    });

    const user = await newUser.save();
    res.status(200).json(user);
  } catch (err) {
    res.status(500).json(err);
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ name: req.body.name });

    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const isPasswordValid = await bcrypt.compare(req.body.password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ error: "Wrong password" });
    }

    const { password, ...userData } = user._doc;
    res.status(200).json({ userData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get login data
app.get('/getlogin', async (req, res) => {
  const data = await User.findOne();
  res.status(200).json(data);
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error(err);
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.redirect('/');
    }
  });
});

// Add user route
app.post('/adduser', async (req, res) => {
  let user = new addUser();
  user.designation = req.body.designation;
  user.name = req.body.name;
  user.walletaddress = req.body.walletaddress;
  const doc = await user.save();

  console.log(doc);
  res.json(doc);
});

// Get users route
app.get('/getuser', async (req, res) => {
  const docs = await User.find({});
  res.json(docs);
});

// File upload and NFT minting route
const upload = multer({
  limits: {
    fileSize: 100000000000000
  }
});

const starton = axios.create({
  baseURL: "https://api.starton.io/v3",
  headers: {
    "x-api-key": "sk_live_7e3b15b6-f5b9-42e4-943f-c29bbb48b0e9"
  }
});

app.post('/upload', cors(), upload.single('file'), async (req, res) => {
  let data = new FormData();
  const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
  data.append("file", blob, { filename: req.file.originalname });
  data.append("isSync", "true");

  async function uploadImageOnIpfs() {
    const ipfsImg = await starton.post("/ipfs/file", data, {
      headers: { "Content-Type": `multipart/form-data; boundary=${data._boundary}` }
    });
    return ipfsImg.data;
  }

  async function uploadMetadataOnIpfs(imgCid) {
    const metadataJson = {
      name: `A Wonderful NFT`,
      description: `Probably the most awesome NFT ever created!`,
      image: `ipfs://ipfs/${imgCid}`
    };
    const ipfsMetadata = await starton.post("/ipfs/json", {
      name: "My NFT metadata Json",
      content: metadataJson,
      isSync: true
    });
    return ipfsMetadata.data;
  }

  const SMART_CONTRACT_NETWORK = "polygon-mumbai";
  const SMART_CONTRACT_ADDRESS = "0x4528b87321AF8919550E54a6aF96C8D032B66d43";
  const WALLET_IMPORTED_ON_STARTON = "0x5Bb267e2f180ACdA8F7648E2eB61B92Ceebc957c";
  const RECEIVER_ADDRESS = "0x84EF41f146beAf8C4725EfDA3EAF27E7eEE39B6B";

  async function mintNFT(receiverAddress, metadataCid) {
    const nft = await starton.post(`/smart-contract/${SMART_CONTRACT_NETWORK}/${SMART_CONTRACT_ADDRESS}/call`, {
      functionName: "mint",
      signerWallet: WALLET_IMPORTED_ON_STARTON,
      speed: "low",
      params: [receiverAddress, metadataCid]
    });
    return nft.data;
  }

  const ipfsImgData = await uploadImageOnIpfs();
  const ipfsMetadata = await uploadMetadataOnIpfs(ipfsImgData.cid);
  const nft = await mintNFT(RECEIVER_ADDRESS, ipfsMetadata.cid);

  console.log("Atharv");
  console.log(nft);
  console.log(RECEIVER_ADDRESS);

  const createAndSaveTransaction = async () => {
    const Transaction = require('./model/transaction');

    const jsonData = {
      transactionHash: nft.transactionHash,
      createdAt: nft.createdAt,
      network: nft.network,
      state: nft.state,
      from: nft.from,
      smart: nft.to,
      to: RECEIVER_ADDRESS
    };

    console.log(jsonData);
    const transaction = new Transaction(jsonData);
    console.log(transaction);

    try {
      await transaction.save();
      console.log('Data saved successfully');
    } catch (error) {
      console.error(error);
    }
  };

  createAndSaveTransaction();

  res.status(201).json({
    transactionHash: nft.transactionHash,
    cid: ipfsImgData.cid
  });
});

// Get transactions route
app.get('/getTransaction', async (req, res) => {
  const trans = await transaction.find({});
  res.json(trans);
});

// Case management
const caseSchema = new mongoose.Schema({
  caseNo: String,
  caseName: String,
  primaryClient: String,
  status: String,
  dateOpened: Date,
  dateClosed: Date,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});

const Case = mongoose.model('Case', caseSchema);

// Add a new case to the database
app.post('/postCases', async (req, res) => {
  try {
    const newCase = new Case(req.body);
    await newCase.save();
    res.status(201).json({ message: 'Case added successfully' });
  } catch (error) {
    console.error('Error adding case:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Retrieve cases from the database
app.get('/getCases', async (req, res) => {
  try {
    const cases = await Case.find({}).populate('user');
    res.status(200).json(cases);
  } catch (error) {
    console.error('Error fetching cases:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Messages
const messageSchema = new mongoose.Schema({
  title: String,
  message1: String,
  message2: String
});

const Message = mongoose.model('Message', messageSchema);

// Handle message storage
app.post('/share', async (req, res) => {
  try {
    const { title, message1, message2 } = req.body;
    const newMessage = new Message({
      title,
      message1,
      message2
    });
    await newMessage.save();
    res.status(200).json({ message: 'Message shared successfully' });
  } catch (error) {
    console.error('Error sharing message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all messages
app.get('/messages', async (req, res) => {
  try {
    const messages = await Message.find({});
    res.status(200).json(messages);
  } catch (error) {
    console.error('Error retrieving messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fallback route for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Server start
const port = 5000; // Replace with your actual port number
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
