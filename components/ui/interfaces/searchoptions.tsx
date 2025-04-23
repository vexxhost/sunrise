interface BaseSearchOptions {
  }
  
  type DynamicInterface = BaseSearchOptions & { [key: string]: any }; // Add dynamic properties
  
 