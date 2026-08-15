# Hisaab Kitaab

Hisaab Kitaab is a shared-expenses app for keeping track of money between friends. It uses a single shared ledger for each friendship, so both people see the same transactions and balance.

## What it does

- Sign in with Google and choose a unique username.
- Search for people by username or email and send friend requests.
- Track shared expenses and see who paid each amount.
- Request an edit or deletion instead of letting either person change a transaction alone.
- Request settlement; the other person must approve before the balance is cleared.
- Keep settled and removed transactions as history.
- Archive former friendships while preserving their shared history.
- Use a custom profile picture, with the Google profile picture as the fallback.
- Use responsive layouts for phone, iPad, and larger screens.

## Tech used

- React
- Firebase Authentication and Cloud Firestore
- Supabase Edge Functions and Storage for profile photos

## Run the app locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Add the Firebase configuration in `src/firebaseClient.js` for your Firebase project.

3. Create a `.env` file with your Supabase project details:

   ```env
   REACT_APP_SUPABASE_URL=your_supabase_project_url
   REACT_APP_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
   ```

4. Start the app:

   ```bash
   npm start
   ```

The app opens at `http://localhost:3000`.

## Supabase profile photos

The profile-photo Edge Function is in `supabase/functions/profile-photo/index.ts`. Deploy it in the Supabase project used by the app, create a public `profile-photos` bucket, and set the `FIREBASE_PROJECT_ID` secret for the function.

## Production build

```bash
npm run build
```
