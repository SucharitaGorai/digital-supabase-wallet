import express from 'express';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import axios from 'axios';


dotenv.config();


const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());


const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return res.status(401).json({ error: 'Basic Authentication required' });
  }

  try {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    if (!username || !password) {
      return res.status(401).json({ error: 'Invalid credentials format' });
    }

    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
};


app.get('/', (req, res) => {
  res.send('Digital Wallet API Running!');
});


app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  try {
    
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('username')
      .eq('username', username)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .insert({
        username,
        password_hash,
        balance: 0
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({ message: 'User registered successfully' });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: 'Registration failed' });
  }
});


app.post('/fund', authenticate, async (req, res) => {
  const { amt } = req.body;
  const userId = req.user.id;

  if (!amt || amt <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }

  try {
    
    const { data: currentUser, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const newBalance = currentUser.balance + amt;

    
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ balance: newBalance })
      .eq('id', userId);

    if (updateError) throw updateError;

    
    await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        kind: 'credit',
        amt: amt,
        updated_bal: newBalance,
        description: 'Account funding'
      });

    res.json({ balance: newBalance });

  } catch (error) {
    console.error('Fund error:', error);
    res.status(400).json({ error: 'Failed to fund account' });
  }
});


app.post('/pay', authenticate, async (req, res) => {
  const { to, amt } = req.body;
  const fromUserId = req.user.id;

  if (!to || !amt || amt <= 0) {
    return res.status(400).json({ error: 'Invalid recipient or amount' });
  }

  try {
    
    const { data: sender, error: senderError } = await supabaseAdmin
      .from('users')
      .select('balance, username')
      .eq('id', fromUserId)
      .single();

    if (senderError) throw senderError;

    
    if (sender.balance < amt) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    
    const { data: recipient, error: recipientError } = await supabaseAdmin
      .from('users')
      .select('id, balance')
      .eq('username', to)
      .single();

    if (recipientError || !recipient) {
      return res.status(400).json({ error: 'Recipient not found' });
    }

    if (recipient.id === fromUserId) {
      return res.status(400).json({ error: 'Cannot pay yourself' });
    }

    
    const newSenderBalance = sender.balance - amt;
    const newRecipientBalance = recipient.balance + amt;

    
    await supabaseAdmin
      .from('users')
      .update({ balance: newSenderBalance })
      .eq('id', fromUserId);

    
    await supabaseAdmin
      .from('users')
      .update({ balance: newRecipientBalance })
      .eq('id', recipient.id);

    
    await supabaseAdmin
      .from('transactions')
      .insert([
        {
          user_id: fromUserId,
          kind: 'debit',
          amt: amt,
          updated_bal: newSenderBalance,
          to_user: to,
          description: `Payment to ${to}`
        },
        {
          user_id: recipient.id,
          kind: 'credit',
          amt: amt,
          updated_bal: newRecipientBalance,
          to_user: sender.username,
          description: `Payment from ${sender.username}`
        }
      ]);

    res.json({ balance: newSenderBalance });

  } catch (error) {
    console.error('Payment error:', error);
    res.status(400).json({ error: 'Payment failed' });
  }
});


app.get('/bal', authenticate, async (req, res) => {
  const { currency } = req.query;
  const userId = req.user.id;

  try {
    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (error) throw error;

    let balance = user.balance;
    let responseCurrency = 'INR';

    
    if (currency && currency.toUpperCase() !== 'INR') {
      try {
        const response = await axios.get(
          `https://api.currencyapi.com/v3/latest?apikey=${process.env.CURRENCY_API_KEY}&currencies=${currency.toUpperCase()}&base_currency=INR`
        );
        
        const rate = response.data.data[currency.toUpperCase()]?.value;
        if (rate) {
          balance = (balance * rate).toFixed(2);
          responseCurrency = currency.toUpperCase();
        }
      } catch (apiError) {
        console.error('Currency conversion error:', apiError);
    
      }
    }

    res.json({
      balance: parseFloat(balance),
      currency: responseCurrency
    });

  } catch (error) {
    console.error('Balance check error:', error);
    res.status(400).json({ error: 'Failed to retrieve balance' });
  }
});


app.get('/stmt', authenticate, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data: transactions, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedTransactions = transactions.map(tx => ({
      kind: tx.kind,
      amt: tx.amt,
      updated_bal: tx.updated_bal,
      timestamp: new Date(tx.created_at).toISOString(),
      description: tx.description,
      to_user: tx.to_user
    }));

    res.json(formattedTransactions);

  } catch (error) {
    console.error('Statement error:', error);
    res.status(400).json({ error: 'Failed to fetch transactions' });
  }
});


app.post('/product', authenticate, async (req, res) => {
  const { name, price, description } = req.body;

  if (!name || !price || price <= 0) {
    return res.status(400).json({ error: 'Invalid product data' });
  }

  try {
    const { data: product, error } = await supabaseAdmin
      .from('products')
      .insert({
        name,
        price,
        description: description || ''
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: product.id,
      message: 'Product added'
    });

  } catch (error) {
    console.error('Add product error:', error);
    res.status(400).json({ error: 'Failed to add product' });
  }
});


app.get('/product', async (req, res) => {
  try {
    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(products);

  } catch (error) {
    console.error('List products error:', error);
    res.status(400).json({ error: 'Failed to fetch products' });
  }
});


app.post('/buy', authenticate, async (req, res) => {
  const { product_id } = req.body;
  const userId = req.user.id;

  if (!product_id) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
 
    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return res.status(400).json({ error: 'Product not found' });
    }

    
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('balance')
      .eq('id', userId)
      .single();

    if (userError) throw userError;

    
    if (user.balance < product.price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const newBalance = user.balance - product.price;

   
    await supabaseAdmin
      .from('users')
      .update({ balance: newBalance })
      .eq('id', userId);

    
    await supabaseAdmin
      .from('transactions')
      .insert({
        user_id: userId,
        kind: 'debit',
        amt: product.price,
        updated_bal: newBalance,
        product_id: product.id,
        description: `Purchase: ${product.name}`
      });

    res.json({
      message: 'Product purchased',
      balance: newBalance
    });

  } catch (error) {
    console.error('Purchase error:', error);
    res.status(400).json({ error: 'Purchase failed' });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});