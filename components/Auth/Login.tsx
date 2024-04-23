"use client"

import { useFormState, useFormStatus } from 'react-dom'
import { login } from "@/app/auth/login/action"
import Image from "next/image"

export default function Login() {
  const [state, action] = useFormState(login, undefined)
  const { pending } = useFormStatus();

  return (
    <>
      <div className="flex min-h-full flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="bg-gray-900 max-w-lg mx-auto py-4 pl-4 rounded-t-lg">
          <Image
              src="/img/logo.png"
              alt="Sunrise"
              width="1225"
              height="189"
            />
          </div>
          <div className="sm:mx-auto sm:w-full sm:max-w-lg">
            <div className="bg-white px-6 py-12 shadow sm:rounded-b-lg sm:px-12">
              <form className="" action={action}>
                <div className="relative -space-y-px rounded-md shadow-sm mb-6">
                  <div className="pointer-events-none absolute inset-0 z-10 rounded-md ring-1 ring-inset ring-gray-300" />
                  <div>
                    <label htmlFor="id_provider" className="sr-only">
                      Identity Provider ID
                    </label>
                    <input
                      id="id-provider"
                      name="id_provider"
                      type="text"
                      required
                      className="text-sm text-center relative block w-full rounded-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-100 placeholder:text-gray-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-gray-600 sm:text-2xl sm:leading-6"
                      placeholder="Identity Provider ID"
                    />
                  </div>
                  {state?.errors?.idProvider && <p className="p-2 text-center bg-gray-100 text-red-500">{state.errors.idProvider}</p>}
                </div>
                <div>
                  <button
                    aria-disabled={pending}
                    type="submit"
                    className="flex w-full justify-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-600"
                  >
                    {pending ? "Signing in..." : "Sign In"}
                  </button>
                </div>
              </form>
            </div>
          </div>
      </div>
    </>
  )
}
