import { redirect } from "next/navigation";

// Root redirects to sign-in; auth middleware will redirect authenticated
// users to their dashboard after Unit 2 (auth) is implemented.
export default function Home() {
  redirect("/auth/signin");
}
