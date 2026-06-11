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

export const Route = createFileRoute("/login/team")({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: user.role === "admin" ? "/admin" : "/team" })
  },
  component: TeamLoginPage,
})

function TeamLoginPage() {
  const router = useRouter()
  const loginFn = useServerFn(login)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    try {
      // the team username is the zero-padded two-digit team number
      const username = String(Number(form.get("number"))).padStart(2, "0")
      await loginFn({
        data: { username, password: String(form.get("password")) },
      })
      await router.navigate({ to: "/team" })
    } catch {
      toast.error("Invalid team number or password")
    } finally {
      setPending(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Team sign in</CardTitle>
          <CardDescription>
            Use your team number and the password your event admin gave you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="number">Team number</Label>
              <Input
                id="number"
                name="number"
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
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
          <Link to="/login" className="hover:underline">
            ← Admin sign in
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
