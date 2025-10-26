# Bond Mate Backend

A modern Node.js backend API built with Express, TypeScript, PostgreSQL, and Prisma ORM.

## Features

- 🚀 **Express.js** - Fast, unopinionated web framework
- 🔷 **TypeScript** - Type-safe JavaScript
- 🐘 **PostgreSQL** - Robust relational database
- 🔧 **Prisma** - Modern database toolkit and ORM
- 🔐 **JWT Authentication** - Secure user authentication
- 🛡️ **Security** - Helmet, CORS, rate limiting
- 📝 **Validation** - Request validation with express-validator
- 🧪 **Testing** - Jest testing framework
- 📊 **Logging** - Morgan HTTP request logger
- 🔄 **Hot Reload** - Nodemon for development

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd bond-mate-backend
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env
```

4. Update the `.env` file with your database credentials:
```env
DATABASE_URL="postgresql://username:password@192.168.220.66:5432/bond_mate_db?schema=public"
JWT_SECRET="your-super-secret-jwt-key-here"
```

5. Set up the database:
```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate
```

## Development

Start the development server:
```bash
npm run dev
```

The server will start on `http://192.168.220.66:3000`

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build the project for production
- `npm start` - Start production server
- `npm run db:generate` - Generate Prisma client
- `npm run db:push` - Push schema changes to database
- `npm run db:migrate` - Run database migrations
- `npm run db:studio` - Open Prisma Studio
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/profile` - Get user profile (protected)
- `PUT /api/auth/profile` - Update user profile (protected)
- `PUT /api/auth/change-password` - Change password (protected)

### Posts
- `GET /api/posts` - Get all posts (public)
- `GET /api/posts/:id` - Get post by ID (public)
- `POST /api/posts` - Create new post (protected)
- `PUT /api/posts/:id` - Update post (protected)
- `DELETE /api/posts/:id` - Delete post (protected)
- `POST /api/posts/:id/like` - Like a post (protected)
- `DELETE /api/posts/:id/like` - Unlike a post (protected)

### Health Check
- `GET /api/health` - Server health check

## Database Schema

The application includes the following models:
- **User** - User accounts with authentication
- **Post** - User posts with content and metadata
- **Comment** - Comments on posts
- **Like** - Post likes
- **Follow** - User following relationships

## Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Route controllers
├── middleware/      # Custom middleware
├── routes/          # API routes
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Application entry point
```

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Rate limiting
- CORS protection
- Helmet security headers
- Input validation and sanitization

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

ISC
