import { CurrencyCode } from '../currency'
import { Nullable } from '../../utils'
import { Plan } from '../plan'
import { User } from '../../user'

type SubscriptionState = 'active' | 'canceled' | 'expired'

// the add-ons attached to a recurly subsription
export type AddOn = {
  add_on_code: string
  add_on_type: string
  quantity: number
  revenue_schedule_type: string
  unit_amount_in_cents: number
}

// when puchasing a new add-on in recurly, we only need to provide the code
export type PurchasingAddOnCode = {
  code: string
}

type Recurly = {
  addOns?: AddOn[]
  tax: number
  taxRate: number
  billingDetailsLink: string
  accountManagementLink: string
  additionalLicenses: number
  totalLicenses: number
  nextPaymentDueAt: string
  currency: CurrencyCode
  state?: SubscriptionState
  trialEndsAtFormatted: Nullable<string>
  trial_ends_at: Nullable<string>
  activeCoupons: any[] // TODO: confirm type in array
  account: {
    email: string
    // data via Recurly API
    has_canceled_subscription: {
      _: 'false' | 'true'
      $: {
        type: 'boolean'
      }
    }
    has_past_due_invoice: {
      _: 'false' | 'true'
      $: {
        type: 'boolean'
      }
    }
  }
  displayPrice: string
  currentPlanDisplayPrice?: string
  pendingAdditionalLicenses?: number
  pendingTotalLicenses?: number
}

export type GroupPolicy = {
  [policy: string]: boolean
}

export type Subscription = {
  _id: string
  admin_id: string
  manager_ids: string[]
  member_ids: string[]
  invited_emails: string[]
  groupPlan: boolean
  groupPolicy?: GroupPolicy
  membersLimit: number
  teamInvites: object[]
  planCode: string
  recurlySubscription_id: string
  plan: Plan
  pendingPlan?: Plan
}

export type RecurlySubscription = Subscription & {
  recurly: Recurly
}

export type CustomSubscription = Subscription & {
  customAccount: boolean
}

export type GroupSubscription = RecurlySubscription & {
  teamName: string
  teamNotice?: string
}

export type ManagedGroupSubscription = {
  _id: string
  userIsGroupMember: boolean
  planLevelName: string
  admin_id: {
    email: string
  }
  features: {
    groupSSO: boolean | null
    managedUsers: boolean | null
  }
  teamName?: string
}

export type MemberGroupSubscription = Omit<GroupSubscription, 'admin_id'> & {
  userIsGroupManager: boolean
  planLevelName: string
  admin_id: User
}
