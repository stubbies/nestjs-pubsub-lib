/**
 * Safely casts an unknown function to jest.Mock and sets its resolved value.
 */
export function mockResolve<T>(fn: unknown, value: T): jest.Mock {
    return (fn as jest.Mock).mockResolvedValue(value);
  }
  
  /**
   * Safely casts an unknown function to jest.Mock and sets its rejected value.
   */
  export function mockReject(fn: unknown, error: Error): jest.Mock {
    return (fn as jest.Mock).mockRejectedValue(error);
  }
  
  /**
   * Safely casts an unknown function to jest.Mock and sets its return value.
   */
  export function mockReturn<T>(fn: unknown, value: T): jest.Mock {
      return (fn as jest.Mock).mockReturnValue(value);
  }