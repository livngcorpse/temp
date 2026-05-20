# Ngrok Setup

Run ngrok for both backend and frontend:

```bash
# Terminal 1 - Backend (port 4000)
ngrok http 4000

# Terminal 2 - Frontend (port 3000) 
ngrok http 3000
```

This will give you public URLs like:
- `https://xxx-xxx-xxx.ngrok-free.app` for backend API
- `https://yyy-yyy-yyy.ngrok-free.app` for frontend

Update your `.env` files with the ngrok URLs:
- `NEXT_PUBLIC_API_URL=https://xxx-xxx-xxx.ngrok-free.app/api`
- `NGROK_FRONTEND_URL=https://yyy-yyy-yyy.ngrok-free.app`

To test downloads on another device:
1. Start ngrok for backend
2. Update `NEXT_PUBLIC_API_URL` in frontend `.env.local`
3. Restart frontend
4. Access frontend via ngrok URL from another device
