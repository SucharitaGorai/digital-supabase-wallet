# 💸 Digital Wallet API

A secure, RESTful backend service for a digital wallet system built with **Node.js**, **Express**, and **Supabase**.  
Users can register, fund their account, pay other users, view transaction history, and purchase products using their wallet balance.  
Supports real-time currency conversion via [currencyapi.com](https://currencyapi.com).

---

## 🚀 Features

- User registration with password hashing (bcrypt)
- Basic Authentication for all protected endpoints
- Fund account (deposit money)
- Pay another user
- Check balance (optionally in another currency)
- View transaction history
- Add products to a global catalog
- Buy products using wallet balance
- Persistent storage with Supabase (Postgres)
- Consistent JSON API responses
- Secure error handling

---

## 🛠️ Tech Stack

- Node.js / Express
- Supabase 
- bcrypt for password hashing
- [currencyapi.com](https://currencyapi.com) for currency conversion
- dotenv for environment variables

---


### 1. Set up environment variables
Create a `.env` file in the root directory:
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
CURRENCY_API_KEY=your_currencyapi_key
PORT=3000

### 2. Set up Supabase database
- Create a Supabase project at [supabase.com](https://supabase.com).
- Create the following tables:


Table 1: users
Column	        Type	      Constraints	Description
id	            UUID	      PRIMARY KEY	Auto-generated UUID
username	      TEXT	      UNIQUE, NOT NULL	Unique username for login
password_hash 	TEXT      	NOT NULL	BCrypt-hashed password
balance       	NUMERIC	    DEFAULT 0	Wallet balance (INR)


Table 2: transactions
Column	      Type	       Constraints	Description
id	          UUID	       PRIMARY KEY	Auto-generated UUID
user_id	      UUID	       REFERENCES users(id)	Links to the user
kind	        TEXT	       NOT NULL	'credit' or 'debit'
amt	          NUMERIC	     NOT NULL	Transaction amount
updated_bal	  NUMERIC	     NOT NULL	Balance after transaction
description	  TEXT		     Transaction notes
to_user	      TEXT	       NULLABLE	Recipient username (for payments)
product_id	  UUID	       NULLABLE	Links to products.id (for purchases)
created_at	  TIMESTAMP	   DEFAULT NOW()	Auto-recorded timestamp

Table 3: products
Column	     Type        	Constraints	Description
id	         UUID	        PRIMARY KEY	Auto-generated UUID
name	       TEXT	        NOT NULL	Product name (e.g., "Smartphone")
price	       NUMERIC	    NOT NULL	Price in INR
description	 TEXT		      Product details
created_at	 TIMESTAMP	  DEFAULT NOW()	Auto-recorded timestamp
			

Author: Sucharita Gorai






