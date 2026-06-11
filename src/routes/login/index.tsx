import { useState } from "react"
import {
  Link,
  createFileRoute,
  redirect,
  useRouter,
} from "@tanstack/react-router"
import { useServerFn } from "@tanstack/react-start"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getCurrentUser, login } from "@/server/functions/auth"
import { KeyboardMusicIcon } from "lucide-react"

export const Route = createFileRoute("/login/")({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: user.role === "admin" ? "/admin" : "/team" })
  },
  component: AdminLoginPage,
})

function AdminLoginPage() {
  const router = useRouter()
  const loginFn = useServerFn(login)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      const user = await loginFn({
        data: {
          username: String(form.get("username")),
          password: String(form.get("password")),
        },
      })
      await router.navigate({ to: user.role === "admin" ? "/admin" : "/team" })
    } catch {
      toast.error("Invalid username or password")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyboardMusicIcon className="size-5" />
            MiniSystem
          </CardTitle>
          <CardDescription>
            Admin sign in with your email or username.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Email or username</Label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" disabled={pending}>
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          <Link to="/login/team" className="hover:underline">
            Team member? Sign in with your team number →
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
