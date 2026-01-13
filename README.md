# DataFlow - Database Management Application

A modern, full-stack React and Node.js application for managing database connections and data. Features a distinctive neon-tech aesthetic with PostgreSQL as the primary database.

## Features

- 🚀 **Database Support**: PostgreSQL (primary and only supported DB in this deployment)
- 📊 **Table Management**: View, edit, add, and delete records with a beautiful UI
- ⚡ **Query Editor**: Execute custom SQL queries with syntax highlighting
- 🎨 **Modern Design**: Distinctive neon-tech aesthetic with smooth animations
- 📱 **Responsive**: Works on desktop and mobile devices
- 🔄 **Real-time Updates**: Live connection status and data refresh

## Tech Stack

### Backend
- Node.js
- Express.js
- PostgreSQL (pg)

### Frontend
- React 18
- Axios for API calls
- Custom CSS with modern design patterns
- Google Fonts (Anybody & IBM Plex Mono)

## Installation

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- A PostgreSQL database

### Setup

1. **Clone or extract the project**

2. **Backend Setup**

```bash
cd backend
npm install
```

3. **Configure Database Connection**

Create a `.env` file in the `backend` directory based on `.env.example`:

```env
PORT=5000
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password
```

**Database Type Options:**
- `postgresql` or `postgres` - PostgreSQL database (port 5432)

Make sure `DB_TYPE` is set to `postgresql` and the PostgreSQL connection variables (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) are configured in `backend/.env`.

4. **Frontend Setup**

```bash
cd frontend
npm install
```

## Running the Application

### Start Backend Server

```bash
cd backend
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The backend will run on `http://localhost:5000`

### Start Frontend Application

In a new terminal:

```bash
cd frontend
npm start
```

The frontend will run on `http://localhost:3000` and automatically open in your browser.

## Usage

### Tables View

1. **Browse Tables**: Select a table from the sidebar to view its data
2. **Add Records**: Click the "+ Add Record" button to insert new data
3. **Edit Records**: Click "Edit" on any row to modify data
4. **Delete Records**: Click "Delete" to remove records (with confirmation)
5. **Pagination**: Navigate through large datasets with Previous/Next buttons

### Query Editor

1. Click the "Query" tab in the navigation
2. Enter your SQL query in the editor
3. Press `Ctrl+Enter` or click "Execute Query" to run
4. View results in a formatted table below

**Example Queries:**

```sql
-- Select data
SELECT * FROM users WHERE active = true LIMIT 10;

-- Insert data
INSERT INTO users (name, email) VALUES ('John Doe', 'john@example.com');

-- Update data
UPDATE users SET status = 'active' WHERE id = 1;

-- Delete data
DELETE FROM users WHERE id = 5;
```

## API Endpoints

### Health Check
- `GET /api/health` - Check server and database status

### Tables
- `GET /api/tables` - List all tables/collections
- `GET /api/table/:tableName?limit=50&offset=0` - Get table data with pagination
- `POST /api/table/:tableName` - Insert a new record
- `PUT /api/table/:tableName/:id` - Update a record
- `DELETE /api/table/:tableName/:id` - Delete a record

### Query
- `POST /api/query` - Execute a custom SQL query
  ```json
  {
    "query": "SELECT * FROM users LIMIT 10",
    "params": []
  }
  ```

## Project Structure

```
data-manager/
├── backend/
│   ├── server.js           # Main server file with API routes
│   ├── package.json        # Backend dependencies
│   ├── .env.example        # Environment variables template
│   └── .env               # Your configuration (create this)
│
└── frontend/
    ├── public/
    │   └── index.html      # HTML template
    ├── src/
    │   ├── components/
    │   │   ├── ConnectionStatus.js   # Connection indicator
    │   │   ├── ConnectionStatus.css
    │   │   ├── TableView.js          # Table data management
    │   │   ├── TableView.css
    │   │   ├── QueryEditor.js        # SQL query interface
    │   │   └── QueryEditor.css
    │   ├── App.js          # Main application component
    │   ├── App.css         # Main styles
    │   ├── index.js        # React entry point
    │   └── index.css       # Global styles
    └── package.json        # Frontend dependencies
```

## Design Philosophy

The application features a **neon-tech aesthetic** with:

- **Typography**: Anybody (variable weight) for headings, IBM Plex Mono for code/data
- **Color Palette**: Dark backgrounds with neon green (#00ff88) and cyan (#00ccff) accents
- **Animations**: Smooth transitions, hover effects, and loading states
- **Layout**: Clean, modern interface with clear visual hierarchy

## Troubleshooting

### Backend won't start
- Check your `.env` file has correct database credentials
- Ensure your database server is running
- Verify the database exists and you have access

### Quick QA / Smoke tests
A small smoke script helps verify the backend and critical endpoints are responding:

Run:

```bash
cd backend
npm run smoke
```

Note: the smoke script uses `jq` to parse JSON; install it locally (macOS: `brew install jq`) if you don't have it.

This runs `GET /api/health`, `GET /api/projects`, and (if a project exists) `GET /api/projects/:id/sites` and exits non-zero on failures.

Quick frontend checks (after `cd frontend && npm install && npm start`):
- Confirm the header shows the new "Wizard" view and that clicking it opens the Project → Site flow.
- In Wizard step 1, try keyboard navigation: Tab to the project list and press Enter to select a project (focus should land on the first item automatically).
- Verify `GET /api/projects` returns an array with normalized `id` properties (backend maps `hub_project_id` → `id`).
- Branding: Check the header shows the **Research Data Hub** logo and agency link; footer contains attribution and a link to `nyc.gov/site/lpc`. (Brand colors are an approximation.)
- Splash page: a landing splash page was added to the app with quick actions: Create a project, View projects, View sites. Use the Home nav button to return to the splash page.
- Create Project page: a dedicated Create Project page was added with a data entry form bound to `hub_projects` fields and an interactive map (Leaflet/OpenStreetMap). The form now supports schema-driven fields (it infers available columns) and client-side validation (required fields, latitude/longitude ranges). After creating a project, the app returns to the Projects table view.
- Favicons & manifest: `frontend/public/favicon.ico`, `frontend/public/favicon-32.png`, and `frontend/public/site.webmanifest` are added. Replace these with official icons if provided and ensure `index.html` includes the proper meta tags (already added).
- Official assets / Brand images: To swap in official images, place files in `frontend/public/assets/` using these recommended names: `research-hub-logo.png` (header/logo — recommended ~320×320) and `research-hero.jpg` or `research-hero.png` (hero background — recommended ~1600×900). Because these are served from `public/`, you can swap them without rebuilding. Include licensing/attribution if required.

### Frontend can't connect to backend
- Ensure backend is running on port 5000
- Check CORS is enabled (already configured)
- Look for errors in browser console

### Database connection fails
- Verify `DB_TYPE` matches your database
- Check hostname, port, username, and password
- Ensure database server allows connections from localhost

### Queries fail
- Make sure you're using correct SQL syntax for your database type
- PostgreSQL uses `$1, $2` for parameters

- Check table and column names are correct

## Development

### Add New Features

The codebase is modular and easy to extend:

1. **New API Endpoints**: Add routes in `backend/server.js`
2. **New Components**: Create in `frontend/src/components/`
3. **Styling**: Update CSS files or add new ones
4. **Database Support**: Extend the switch statement in `server.js`

### Environment Variables

All configuration should go in `.env`:

```env
PORT=5000
DB_TYPE=postgresql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=database_name
DB_USER=username
DB_PASSWORD=password
```

## Security Notes

⚠️ **Important for Production:**

1. Never commit `.env` files to version control
2. Use environment variables for sensitive data
3. Implement proper authentication and authorization
4. Validate and sanitize all user inputs
5. Use parameterized queries to prevent SQL injection
6. Enable HTTPS in production
7. Set up proper CORS policies

## License

MIT License - Feel free to use and modify as needed.

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the API documentation
3. Inspect browser console for errors
4. Check backend logs for database issues

---

Built with ⚡ by Claude - Enjoy managing your data!
